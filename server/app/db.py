"""Database engine and the per-request tenant-context primitive.

The whole security model of this service rests on ONE rule (see the project
memory from Phase 1a): tenant context is applied with `SET LOCAL app.tenant_id`
INSIDE a transaction, so it is transaction-scoped and cannot leak across pooled
connections. Never a session-level SET.

`tenant_connection(None)` opens a transaction with NO context set. Because the
RLS policies read `NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
an unset context matches nothing -> the request fails CLOSED (zero rows). There
is deliberately no "unset means all tenants" path anywhere.

THE DIRECTORY ENGINE IS THE ONE CONNECTION HERE THAT SETS NO TENANT CONTEXT AND
IS NOT FAILING CLOSED BY DOING SO, which is why it is spelled out rather than
left to look like an oversight. `directory_connection()` uses a SEPARATE engine
bound to a SEPARATE role and never touches app.tenant_id. The question its one
relation answers is "which tenant?", so a tenant-filtered read of it would be
readable exactly when it is useless, and with no context set it would fail
closed to zero rows on every legitimate read.

WHAT CONTAINS THAT ROLE IS THE GRANT, NOT A POLICY -- migration 0009's own
section heading. Measured on the live cluster 2026-08-10, as the role itself:
it holds SELECT on directory.shop_codes and no privilege on any relation in
schema public, where a read is refused with `permission denied for schema
public`. So the absence of a GUC costs nothing: there is no shop data within
its reach for a policy to have filtered.

Do NOT hand `directory_engine` to `tenant_connection`, and do not reach for
`directory_connection()` from a request that already has a principal -- a
request that knows its tenant must use `engine`.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from .config import APP_DATABASE_URL, DIRECTORY_DATABASE_URL

engine = create_async_engine(APP_DATABASE_URL, pool_pre_ping=True)

# The shop-code directory reader. A separate engine because it is a separate
# ROLE -- see the module docstring for why this one sets no tenant context.
# Nothing in the application opens a connection on it yet; no endpoint resolves
# a code. Creating the engine makes no connection, so this costs nothing until
# something uses it.
directory_engine = create_async_engine(DIRECTORY_DATABASE_URL, pool_pre_ping=True)


def constraint_name_of(exc: BaseException) -> str:
    """The Postgres constraint an IntegrityError violated, or "" if unknown.

    NOT `exc.orig.constraint_name`. That attribute IS ABSENT HERE, and reading it
    does not raise — it yields "" for every violation, which silently makes every
    `if constraint == ...` branch unreachable. It is how the idempotency-race
    handler in bills.py came to be dead code from the day it was written.

    SQLAlchemy's asyncpg dialect does not hand back the asyncpg exception. It
    builds its OWN DBAPI-shaped IntegrityError, copies only sqlstate onto it, and
    chains the real one as __cause__ (see dialects/postgresql/asyncpg.py,
    _handle_exception). Observed on this stack, asyncpg 0.30 / SQLAlchemy 2.0.51:

        exc                                -> sqlalchemy.exc.IntegrityError
        exc.orig                           -> sqlalchemy...asyncpg.IntegrityError
        exc.orig.constraint_name           -> ABSENT
        exc.orig.sqlstate                  -> '23505'
        exc.orig.__cause__                 -> asyncpg.exceptions.UniqueViolationError
        exc.orig.__cause__.constraint_name -> 'uq_sellers_tenant_code'

    The chain is walked rather than indexed so that a future driver or dialect
    that puts the attribute somewhere else still resolves, and so that the
    failure mode of a missing name is "" — which every caller must treat as
    "I do not know", never as "no constraint".
    """
    orig = getattr(exc, "orig", None)
    for candidate in (getattr(orig, "__cause__", None), orig, exc):
        name = getattr(candidate, "constraint_name", None)
        if name:
            return str(name)
    return ""


@asynccontextmanager
async def tenant_connection(
    tenant_id: uuid.UUID | None, *, isolation_level: str | None = None
) -> AsyncIterator[AsyncConnection]:
    """Yield a connection whose open transaction has app.tenant_id set LOCAL.

    tenant_id is None -> no context is set -> RLS returns nothing (fail closed).

    isolation_level exists for a request whose SEPARATE READS MUST AGREE WITH
    EACH OTHER. Under the default READ COMMITTED every statement takes a fresh
    snapshot, so a bill committing between two of them is counted by one and not
    the other — a daily total that does not equal the sum of the lines printed
    underneath it. That is a report the owner cannot reconcile, on the one screen
    whose whole job is reconciling.

    REPEATABLE READ costs nothing here and cannot fail: a READ-ONLY repeatable
    read transaction never raises a serialization error in Postgres (40001 comes
    from writes). Do NOT reach for it on a write path without thinking about that.

    It is applied BEFORE begin() because an isolation level can only be chosen at
    transaction start; SQLAlchemy issues it as part of starting the transaction,
    ahead of the set_config below.
    """
    async with engine.connect() as conn:
        if isolation_level is not None:
            conn = await conn.execution_options(isolation_level=isolation_level)
        async with conn.begin():
            if tenant_id is not None:
                await conn.execute(
                    text("SELECT set_config('app.tenant_id', :t, true)"),
                    {"t": str(tenant_id)},
                )
            yield conn


@asynccontextmanager
async def directory_connection() -> AsyncIterator[AsyncConnection]:
    """Yield a connection on the directory engine. NO tenant context is set.

    The omission is the design, not an oversight; the module docstring gives the
    reason and the measurement behind it. This exists so that the absence of a
    `set_config` call is a property of a NAMED primitive that says why, rather
    than something a future caller has to remember not to add.

    It takes no tenant_id and no isolation_level. There is no tenant to pass --
    resolving one is what the caller is about to do -- and the single relation
    within this role's reach is read by one statement, so there are no separate
    reads that could disagree with each other.
    """
    async with directory_engine.connect() as conn:
        async with conn.begin():
            yield conn

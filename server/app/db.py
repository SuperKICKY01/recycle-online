"""Database engine and the per-request tenant-context primitive.

The whole security model of this service rests on ONE rule (see the project
memory from Phase 1a): tenant context is applied with `SET LOCAL app.tenant_id`
INSIDE a transaction, so it is transaction-scoped and cannot leak across pooled
connections. Never a session-level SET.

`tenant_connection(None)` opens a transaction with NO context set. Because the
RLS policies read `NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
an unset context matches nothing -> the request fails CLOSED (zero rows). There
is deliberately no "unset means all tenants" path anywhere.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from .config import APP_DATABASE_URL

engine = create_async_engine(APP_DATABASE_URL, pool_pre_ping=True)


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
async def tenant_connection(tenant_id: uuid.UUID | None) -> AsyncIterator[AsyncConnection]:
    """Yield a connection whose open transaction has app.tenant_id set LOCAL.

    tenant_id is None -> no context is set -> RLS returns nothing (fail closed).
    """
    async with engine.connect() as conn:
        async with conn.begin():
            if tenant_id is not None:
                await conn.execute(
                    text("SELECT set_config('app.tenant_id', :t, true)"),
                    {"t": str(tenant_id)},
                )
            yield conn

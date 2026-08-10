# Recycle Online — server

FastAPI + PostgreSQL backend, and the single source of truth for business rules.

**Status: running API.** Login (`/auth/login`), purchase bills (create, read,
list, void), and read-only master data (`/products`, `/sellers`), over a schema
with per-tenant row-level security. Every request is scoped to its token's tenant
via `SET LOCAL`. Seven proof scripts in `scripts/` exercise the real paths
against a live database — tenant isolation, auth, master data, bills, the
master-data rejection gate, shop-timezone numbering, and per-bill seller
pricing. Each must pass twice in a row without reseeding
(`lessons/proof-must-run-twice.md`).

## Local setup

Requires Docker Desktop and Python 3.12+ (`uv` recommended).

```bash
cd server
cp .env.example .env           # DEV-ONLY credentials, already match compose
                               # then set JWT_SECRET — see below, it ships empty

docker compose up -d           # Postgres on localhost:5544; first run creates
                               #   roles + the `recycle` database via db/init

uv sync                        # create .venv and install deps

uv run alembic upgrade head    # apply the schema (runs as the OWNER role)

uv run python scripts/prove_rls.py   # prove tenant isolation (runs as APP role)
```

## JWT_SECRET (required — the app will not start without it)

`JWT_SECRET` has **no default**, deliberately: a shared fallback value is a
shared identity, and anyone holding it can forge a token for any tenant. Generate
one into `.env` with the command below. **Every deployment needs its own** — dev,
staging and each cloud environment, never copied between them.

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Roles

| role                | superuser | owns tables | RLS applies | used for            |
|---------------------|-----------|-------------|-------------|---------------------|
| `postgres`          | yes       | no          | (bypasses)  | container bootstrap  |
| `recycle_owner`     | no        | yes         | yes (FORCE) | Alembic migrations   |
| `recycle_app`       | no        | no          | yes (FORCE) | application runtime  |
| `recycle_directory` | no        | no          | yes, never reached | shop-code lookup only |

`recycle_directory` reads the shop-code directory — the relation mapping a
human-typable shop code to a `tenant_id`, which is what a login has to resolve
before any principal exists. **In the database `recycle`** it holds **no `USAGE`
on schema `public`**, so it cannot reach `tenants`, `users`, `purchase_bills` or
any other business table by any path. That is why it is a separate role and not a
grant on `recycle_app`. **The database is named on purpose:** that containment was
established by one `REVOKE` in one database (`db/init/00_init_roles.sql:101`, run
after `\connect recycle` at `:95`), and a role is cluster-wide while a schema
`REVOKE` is not — see
`lessons/README.md § Lessons` "a-grant-boundary-belongs-to-a-database-not-a-role.md".

**WHAT CONTAINS THIS ROLE, AND WHAT DOES NOT — the table cell above is true and
was being read as the wrong thing.** `rolbypassrls` is `f`, so RLS does apply to
this role; the cell is not wrong. But the role holds **no privilege on any table
RLS would adjudicate**, so no policy ever decides anything for it — it is stopped
one layer earlier, at the schema. Migration 0009 says so in its own section
heading, `ISOLATION HERE IS A GRANT, NOT A POLICY`. The containment is the
absent `USAGE`; RLS is a backstop that is never reached. Anyone reasoning about
this role from the RLS column alone is reasoning about the wrong mechanism, and
would conclude that granting it `USAGE` on `public` is safe because "RLS still
applies" — it is not, because the tenant policies compare against
`app.tenant_id`, a GUC this role never sets.

**MEASURED 2026-08-10, on the live cluster, as the role itself.** A control read
of `directory.shop_codes` succeeded FIRST, so the refusals below are informative
rather than the symptom of a broken connection. Six schema-qualified reads —
`tenants`, `users`, `purchase_bills`, `purchase_bill_items`, `alembic_version`,
`server_clock_watermark` — each returned `ERROR: permission denied for schema
public`. **Schema level, not relation level**, which is the distinction a design
can rest on. Repeated on all nine `recycle*` databases, with the same result.
Full evidence: the `2026-08-10` entry in `PROJECT_STATUS.md`.

**Its migration is committed and APPLIED — to `recycle` on 2026-08-09, and
measured on 2026-08-10 as present on FOUR databases** (`recycle`,
`recycle_keyshape_scratch`, `recycle_restore_scratch`,
`recycle_tw20260809_0009fixture`), all reading `0009` and all carrying schema
`directory`. This sentence read **"not yet applied to any cluster"** until
2026-08-10; it was already false when `8b17bc2` corrected three other files and
did not reach this one.

To rebuild from scratch: `docker compose down -v` (drops the volume, so
`db/init` runs again), then repeat from `docker compose up -d`.

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
| `recycle_directory` | no        | no          | yes (FORCE) | shop-code lookup only |

`recycle_directory` reads the shop-code directory — the relation mapping a
human-typable shop code to a `tenant_id`, which is what a login has to resolve
before any principal exists. It holds **no `USAGE` on schema `public`**, so it
cannot reach `tenants`, `users`, `purchase_bills` or any other business table by
any path. That is why it is a separate role and not a grant on `recycle_app`.
Its migration is committed and **not yet applied to any cluster**.

To rebuild from scratch: `docker compose down -v` (drops the volume, so
`db/init` runs again), then repeat from `docker compose up -d`.

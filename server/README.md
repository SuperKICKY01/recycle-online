# Recycle Online — server

FastAPI + PostgreSQL backend. **Phase 1a status: database schema + tenant
isolation only.** No API/web framework yet (that is a later phase).

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

| role            | superuser | owns tables | RLS applies | used for            |
|-----------------|-----------|-------------|-------------|---------------------|
| `postgres`      | yes       | no          | (bypasses)  | container bootstrap  |
| `recycle_owner` | no        | yes         | yes (FORCE) | Alembic migrations   |
| `recycle_app`   | no        | no          | yes (FORCE) | application runtime  |

To rebuild from scratch: `docker compose down -v` (drops the volume, so
`db/init` runs again), then repeat from `docker compose up -d`.

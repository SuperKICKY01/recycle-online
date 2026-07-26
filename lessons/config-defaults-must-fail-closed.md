# A default for a security secret is a default IDENTITY

**Rule.** Config that decides WHO SOMEONE IS gets no default value. Read it with
`os.environ["X"]`, never `os.environ.get("X", <fallback>)`, and treat an empty
string as absent. The process must refuse to start.

## What happened

`config.py` had:

```python
JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-only-insecure-secret-do-not-use-in-prod")
```

and that exact string was committed in `.env.example`. Two lines above it,
`APP_DATABASE_URL` used `os.environ[...]` and failed closed. The security-
critical one failed OPEN.

This is not theoretical. Verified against the running server: a token signed with
the published default, for a tenant we had no password for, carrying a `sub` that
matched no user, was accepted — returning that tenant's sellers and full price
list.

```
GET /sellers as forged tenant-B principal -> 200
  {"sellers":[{"name":"Seller of Shop B","grade":"A"}]}
```

The whole isolation stack — RLS, `SET LOCAL`, composite tenant FKs, a
`NOBYPASSRLS` role — worked perfectly and was irrelevant. It faithfully served
whatever tenant the forged token claimed. **Isolation enforces the identity it is
given; it cannot question where that identity came from.**

## Why a default is worse than a missing value

A missing value fails loudly on the first boot, in front of whoever is deploying.
A default fails silently, forever, and looks healthy: the service starts, serves
traffic, logs nothing unusual. Nothing about a running system reveals that its
signing key is the one in the public repo. The failure surfaces only as a breach.

The empty case is the same bug wearing a disguise: `.env.example` now ships
`JWT_SECRET=` with no value, and copying it yields `""` — which `os.environ[...]`
returns happily. Hence the explicit emptiness check.

## Testing note that cost a run

`load_dotenv()` does NOT resolve `.env` relative to the current directory. With
no arguments it walks up from the **calling file's** directory, so
`server/app/config.py` finds `server/.env` no matter where the process was
started. An attempt to prove fail-closed by running `uvicorn` from a scratch
directory therefore booted normally and hung, "disproving" a fix that was
correct.

To test config isolation, set the variable explicitly in the environment
(`load_dotenv` defaults to `override=False`, so a real env var wins), or use
`python -c`, where the caller frame is `<string>` and dotenv falls back to cwd.
Verify the guard fires; do not infer it from a process that failed to start for
some other reason ([[diagnosis-must-precede-the-fix]]).

## How to apply

1. Any secret, key, or credential: no default, ever. Empty counts as missing.
2. Grep for `environ.get(` with a second argument in config modules. Each hit is
   a question: what happens if this is wrong in production?
3. A committed example file must ship the KEY with no VALUE, plus the command to
   generate one. Never a working placeholder — placeholders get deployed.
4. When a config guard is added, prove it by real process startup, and know how
   your dotenv loader resolves paths before believing the result.

**Where proven.** `server/app/config.py`. Fail-closed shown two ways: absent →
`KeyError` at import, empty → `RuntimeError` killing a real `uvicorn` boot with
exit 1. The forged token that returned 200 before now returns 401, verified side
by side against both servers.

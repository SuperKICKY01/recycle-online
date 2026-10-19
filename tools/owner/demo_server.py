"""Serve the API against the owner's demo database `recycle_demo` on 0.0.0.0:8000 (start_demo.ps1).

    server\\.venv\\Scripts\\python.exe tools\\owner\\demo_server.py      (from the repo root)

The three database URLs from server/.env are rebound to `recycle_demo` in THIS process's
environment BEFORE the app is imported, so the app's engines can only ever see the demo database
(lessons/a-scratch-proof-imports-the-app-only-after-it-rebinds-the-database.md). uvicorn runs in
this process, so stopping this process stops the server. No connection string is taken on the
command line and none is printed.
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER_DIR = os.path.join(ROOT, "server")
sys.path.insert(0, SERVER_DIR)
os.chdir(SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER_DIR, ".env"))

from sqlalchemy.engine import make_url  # noqa: E402

DEMO = "recycle_demo"


def main() -> None:
    if make_url(os.environ["APP_DATABASE_URL"]).database == DEMO:
        raise SystemExit(f"DEMO_SERVER_REFUSED: server/.env names {DEMO!r} as its own database")
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        os.environ[key] = make_url(os.environ[key]).set(database=DEMO).render_as_string(hide_password=False)
    print(f"DEMO_SERVER database={DEMO} listening on 0.0.0.0:8000 -- close this window to stop it", flush=True)
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info", access_log=True)


if __name__ == "__main__":
    main()

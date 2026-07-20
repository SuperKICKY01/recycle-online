"""Runtime configuration, loaded from the environment (.env)."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

# The app connects ONLY as the RLS-bound application role. It must never use the
# owner/migration URL at runtime.
APP_DATABASE_URL: str = os.environ["APP_DATABASE_URL"]

JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-only-insecure-secret-do-not-use-in-prod")
JWT_ALG: str = "HS256"
JWT_TTL_SECONDS: int = int(os.environ.get("JWT_TTL_SECONDS", "3600"))

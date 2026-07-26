"""Runtime configuration, loaded from the environment (.env)."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

# The app connects ONLY as the RLS-bound application role. It must never use the
# owner/migration URL at runtime.
APP_DATABASE_URL: str = os.environ["APP_DATABASE_URL"]

# NO DEFAULT, deliberately. A fallback secret is a fallback IDENTITY: with a
# known value anyone can mint a token claiming any tenant_id, and RLS will
# faithfully honour whatever tenant that forged token claims — every isolation
# control below it becomes decorative. Fail closed at import, exactly like
# APP_DATABASE_URL above, so a misconfigured deploy cannot boot at all rather
# than booting silently insecure.
JWT_SECRET: str = os.environ["JWT_SECRET"]
if not JWT_SECRET.strip():
    # An empty value is as dangerous as a shared one, and copying .env.example
    # (which ships the key with no value) produces exactly that.
    raise RuntimeError(
        "JWT_SECRET is set but empty. Generate one with:\n"
        '    python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )

JWT_ALG: str = "HS256"
JWT_TTL_SECONDS: int = int(os.environ.get("JWT_TTL_SECONDS", "3600"))

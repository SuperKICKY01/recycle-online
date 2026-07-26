"""Runtime configuration, loaded from the environment (.env)."""
from __future__ import annotations

import datetime as dt
import os

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# SHOP TIMEZONE — the ONE place a timezone is defined server-side.
#
# A business day belongs to the SHOP, not to whichever device or server happens
# to handle the request. doc_no's Buddhist-era year and the SRS 3.3 daily reports
# must not change depending on who opens them or where the server runs, so every
# shop-local date derives from here and from nowhere else.
#
# NOTHING may read a timezone from anywhere else — not the server's local clock,
# not os.environ["TZ"], not a device-supplied value. If you need a shop-local
# date, convert with SHOP_TIMEZONE.
#
# TEMPORARY SHAPE: one constant for all tenants. This BECOMES A PER-TENANT
# SETTING (a timezone column on `tenants`) once there is a shop outside
# Thailand; this constant is then the default, not the answer.
#
# WHY A FIXED OFFSET rather than ZoneInfo("Asia/Bangkok"): Thailand has observed
# UTC+7 with no daylight saving since 1920, so the two are identical here, and a
# fixed offset needs no IANA database. That is not a theoretical concern —
# verified on this dev box, zoneinfo raises ZoneInfoNotFoundError for
# "Asia/Bangkok" because Windows ships no IANA db and `tzdata` is not installed.
# When this becomes per-tenant it MUST move to real ZoneInfo (and `tzdata` must
# join the dependencies for Windows dev), because a zone that observes daylight
# saving cannot be expressed as a fixed offset.
# ---------------------------------------------------------------------------
SHOP_TIMEZONE_NAME: str = "Asia/Bangkok"
SHOP_TIMEZONE: dt.timezone = dt.timezone(dt.timedelta(hours=7), SHOP_TIMEZONE_NAME)

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

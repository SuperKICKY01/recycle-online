"""Phase 1b deliverable: prove the auth + tenant-context layer over REAL HTTP.

Hits a running instance of the API (default http://127.0.0.1:8099). Seed the
DB first with scripts/seed_dev.py and start the server.

    python scripts/prove_auth.py     (from the server/ directory)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")

failures: list[str] = []


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)


def do_login(client: httpx.Client, tenant_id, username: str, password: str) -> httpx.Response:
    return client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": username, "password": password},
    )


def whoami(client: httpx.Client, token: str | None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.get(f"{BASE}/whoami", headers=headers)


def tamper(token: str) -> str:
    head, payload, sig = token.split(".")
    flipped = ("A" if sig[0] != "A" else "B") + sig[1:]
    return f"{head}.{payload}.{flipped}"


def main() -> int:
    with httpx.Client(timeout=15.0) as client:
        banner("CASE 1 - login as tenant A admin -> token")
        r = do_login(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
        token_a = r.json().get("access_token") if r.status_code == 200 else None
        print(f"  status={r.status_code}  got_token={bool(token_a)}")
        check(r.status_code == 200 and bool(token_a), "case1: A login did not return a token")

        banner("CASE 2 - login as tenant B admin -> token")
        r = do_login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)
        token_b = r.json().get("access_token") if r.status_code == 200 else None
        print(f"  status={r.status_code}  got_token={bool(token_b)}")
        check(r.status_code == 200 and bool(token_b), "case2: B login did not return a token")

        banner("CASE 3 - GET /whoami with A's token -> resolves tenant A, user A")
        r = whoami(client, token_a)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        print(f"  status={r.status_code}  body={body}")
        check(r.status_code == 200, "case3: whoami(A) not 200")
        check(body.get("tenant_id") == str(TENANT_A_ID), "case3: wrong tenant_id")
        check(body.get("db_tenant_context") == str(TENANT_A_ID), "case3: server applied wrong SET LOCAL")
        check(body.get("user_visible_under_tenant") is True, "case3: token user not visible under tenant A")
        check(body.get("db_username") == ADMIN_USERNAME, "case3: wrong username resolved")

        banner("CASE 4 - GET /whoami with B's token -> resolves tenant B")
        r = whoami(client, token_b)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        print(f"  status={r.status_code}  body={body}")
        check(r.status_code == 200, "case4: whoami(B) not 200")
        check(body.get("tenant_id") == str(TENANT_B_ID), "case4: wrong tenant_id")
        check(body.get("db_tenant_context") == str(TENANT_B_ID), "case4: server applied wrong SET LOCAL")
        check(body.get("user_visible_under_tenant") is True, "case4: token user not visible under tenant B")

        banner("CASE 5 - GET /whoami with NO token -> rejected (401), not open")
        r = whoami(client, None)
        print(f"  status={r.status_code}  body={r.text.strip()[:120]}")
        check(r.status_code == 401, "case5: missing token was NOT rejected with 401")

        banner("CASE 6 - GET /whoami with a tampered-signature token -> rejected")
        tampered = tamper(token_a) if token_a else "x.y.z"
        r = whoami(client, tampered)
        print(f"  status={r.status_code}  body={r.text.strip()[:120]}")
        check(r.status_code == 401, "case6: tampered token was NOT rejected with 401")

        banner("CASE 7 - login correct user, WRONG password -> rejected")
        r = do_login(client, TENANT_A_ID, ADMIN_USERNAME, "totally-wrong-password")
        print(f"  status={r.status_code}  body={r.text.strip()[:120]}")
        check(r.status_code == 401, "case7: wrong password was NOT rejected with 401")

        banner("CASE 8 - username exists in A, but login with B's tenant id + A's password -> rejected")
        r = do_login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
        print(f"  status={r.status_code}  body={r.text.strip()[:120]}")
        check(r.status_code == 401, "case8: cross-tenant login was NOT rejected with 401")

    banner("RESULT")
    if failures:
        print("  FAILED:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print("  ALL CASES PASSED - auth + per-request tenant context hold over HTTP.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

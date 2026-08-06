"""R1a deliverable: prove the server can REFUSE A TOKEN IT ALREADY ISSUED.

Hits a running instance of the API (default http://127.0.0.1:8099) against a
live database, over real HTTP. Seed with scripts/seed_dev.py, apply migration
0005, and start the server first.

    python scripts/prove_revocation.py     (from the server/ directory)

WHAT THIS PROVES, AND WHAT WOULD MAKE IT RED
--------------------------------------------
Until 0005 an issued token was accepted until its `exp`, whatever happened to
the user behind it. There was no mechanism to refuse one, so there was nothing
to test. This script asserts the mechanism EXISTS and BITES:

  CASE 1  a live session works                     -> 200/201 on the money path
  CASE 2  a bumped version refuses the SAME token  -> 401 token_revoked
  CASE 3  the user is NOT locked out               -> a new login works
  CASE 4  a pre-0005 token is refused              -> 401 token_unversioned
  CASE 5  a bump is scoped to ONE user             -> A's peers and tenant B live
  CASE 6  the bump endpoint is admin-only and RLS-scoped -> 403 / 404
  CASE 7  the disproof: which line, deleted, makes this go red

EVERY CHECK IS PHRASED AS THE CLAIM THAT MUST HOLD, never as the failure it
would be. A line reading `[OK] a revoked token was not refused` is a sentence
whose two halves disagree, and an operator scanning a hundred of them will read
the words, not the tag.

NO DATABASE CONNECTION. Every fact below is read out of an HTTP response —
logins through /auth/login, bills through POST /bills, bumps through the real
endpoint. There is not one direct INSERT or UPDATE in this file, so nothing
here can pass over a row the product could not have produced
(lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md).

THE ONE ARTIFACT THE PRODUCT CAN NO LONGER MINT is CASE 4's pre-0005 token,
and it is built as the EXACT payload create_access_token produced before this
migration — six claims, same names, same types, signed with the same secret and
algorithm. That is not a hand-invented fixture: it is the token this server
issued to every device for months, and there is now no API path that mints one.
Reproducing it is the only way to test the case at all, and getting the shape
wrong would prove something about a malformed token instead.

TWICE IN A ROW, NO RESEED (lessons/proof-must-run-twice.md):
  - every idempotency key, bill id and item id carries a per-run UUID;
  - token_version is asserted as a DELTA (this bump returned one more than the
    last), never as an absolute value. The seeded users' versions only ever
    climb, so an absolute assertion would be measuring how many times this
    script has been run — a check with a half-life;
  - nothing is normalised as setup. The script creates what it measures.

WHAT IT LEAVES BEHIND: 2 active bills per run in tenant A (hard rule 5 — a
proof cannot delete a transaction), and the token_version of both tenant A
users and tenant B's admin raised by a few. Neither is a row the product could
not have produced; the bills are ordinary purchases and the counters are what
the endpoint is for. The bill count is printed in the summary.

NOTHING HERE ASSERTS ON A MESSAGE. The server's kind/code is the contract; the
message is English, for logs. Thai text in a 403/404 body will render as
mojibake on a CP874 console and that is a rendering artefact, not evidence
about the data (lessons/console-is-not-the-observation.md).
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
import jwt  # noqa: E402

from app.config import JWT_ALG, JWT_SECRET, JWT_TTL_SECONDS  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")

# Per-run tag. Every key this script writes carries it, so run 2 collides with
# nothing run 1 left behind.
RUN = uuid.uuid4().hex[:8]

failures: list[str] = []
bills_created = 0


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, claim: str) -> None:
    """`claim` is what must be TRUE. It is printed either way, so the tag and
    the sentence always agree with each other."""
    print(f"  [{'OK  ' if cond else 'FAIL'}] {claim}")
    if not cond:
        failures.append(claim)


def body_of(r: httpx.Response) -> dict:
    """The parsed body, or {} — never an exception that hides the status."""
    try:
        return r.json()
    except Exception:  # noqa: BLE001
        return {}


def detail_of(r: httpx.Response) -> dict:
    d = body_of(r).get("detail")
    return d if isinstance(d, dict) else {}


def login(client: httpx.Client, tenant_id, username: str, password: str) -> str | None:
    r = client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": username, "password": password},
    )
    return body_of(r).get("access_token") if r.status_code == 200 else None


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def claims_of(token: str) -> dict:
    """Read a token's payload WITHOUT verifying it.

    Inspecting an artifact the server just handed us, exactly as the mobile
    client reads its own `role` claim. Never used to decide whether a request
    should have succeeded — only to assert that what the server MINTED agrees
    with what the bump endpoint REPORTED, which is the link between the two
    halves of the mechanism.
    """
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def whoami(client: httpx.Client, token: str) -> httpx.Response:
    return client.get(f"{BASE}/whoami", headers=auth(token))


def bump(client: httpx.Client, admin_token: str, user_id: str) -> httpx.Response:
    return client.post(
        f"{BASE}/users/{user_id}/revoke-sessions", headers=auth(admin_token)
    )


def bill_payload(tag: str) -> dict:
    """An ordinary tenant-A purchase, priced by the seller's grade like any other.

    Nothing about this bill is special to revocation. That is deliberate: the
    money path is what a revoked token must not be able to walk, so the fixture
    has to be a bill POST /bills would accept on any normal day.
    """
    return {
        "id": str(uuid.uuid4()),
        "seller_id": str(SELLER_A_ID),
        "vehicle_no": None,
        "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "idempotency_key": f"rev-{RUN}-{tag}",
        "items": [
            {
                "id": str(uuid.uuid4()),
                "product_id": str(PRODUCT_A_ID),
                "line_no": 1,
                "gross_weight": "10.000",
                "tare_weight": "0.000",
                "net_weight": "10.000",
                "unit_price": "15.00",
            }
        ],
    }


def post_bill(client: httpx.Client, token: str, payload: dict) -> httpx.Response:
    return client.post(f"{BASE}/bills", headers=auth(token), json=payload)


def pre_0005_token(user_id: str, tenant_id, username: str, role: str) -> str:
    """A token in the EXACT shape create_access_token produced before 0005.

    Six claims — sub, tenant_id, username, role, iat, exp — signed with the same
    secret and the same algorithm, and NO token_version. This is the only
    fixture in this file the product can no longer mint: every device held one
    of these until the migration landed, and there is now no request that
    produces one. It is reproduced rather than invented precisely so that CASE 4
    tests a REAL legacy token and not some malformed string that would be
    refused for an unrelated reason.
    """
    now = dt.datetime.now(tz=dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=JWT_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def main() -> int:  # noqa: C901
    global bills_created

    with httpx.Client(timeout=20.0) as client:
        # ------------------------------------------------------------------
        banner("SETUP - three live sessions: tenant A staff, tenant A admin, tenant B admin")
        staff_token = login(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
        admin_token = login(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
        b_admin_token = login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)
        if not (staff_token and admin_token and b_admin_token):
            print("  could not log in — is the server up and the seed applied?")
            print("  staff=%s adminA=%s adminB=%s"
                  % (bool(staff_token), bool(admin_token), bool(b_admin_token)))
            return 2

        staff_id = body_of(whoami(client, staff_token)).get("user_id")
        b_admin_id = body_of(whoami(client, b_admin_token)).get("user_id")
        print(f"  run tag        : {RUN}")
        print(f"  tenant A staff : {staff_id}")
        print(f"  tenant B admin : {b_admin_id}")
        print(f"  staff token claims: {claims_of(staff_token)}")
        if not (staff_id and b_admin_id):
            print("  /whoami did not return a user_id — cannot continue")
            return 2
        check("token_version" in claims_of(staff_token),
              "setup: a freshly minted token carries a token_version claim")

        # ------------------------------------------------------------------
        banner("CASE 1 - a live session works, including the money path")
        r = whoami(client, staff_token)
        print(f"  GET /whoami            status={r.status_code}")
        check(r.status_code == 200, "case1: a live token is accepted by /whoami (200)")

        first_bill = bill_payload("live")
        r = post_bill(client, staff_token, first_bill)
        print(f"  POST /bills            status={r.status_code}"
              f"  doc_no={body_of(r).get('doc_no')}")
        check(r.status_code == 201, "case1: a live token can create a bill (201)")
        if r.status_code == 201:
            bills_created += 1

        # ------------------------------------------------------------------
        banner("CASE 2 - bump the version; the SAME token is refused")
        r = bump(client, admin_token, staff_id)
        v1 = body_of(r).get("token_version")
        print(f"  POST /users/{{id}}/revoke-sessions  status={r.status_code}  body={body_of(r)}")
        check(r.status_code == 200, "case2: the bump endpoint answers 200")
        check(isinstance(v1, int), "case2: the bump returns the new token_version")

        r = whoami(client, staff_token)
        print(f"  GET /whoami with the SAME token   status={r.status_code}")
        print(f"    body: {json.dumps(body_of(r), ensure_ascii=False)}")
        check(r.status_code == 401, "case2: the SAME token is now refused with 401")
        check(detail_of(r).get("kind") == "unauthenticated",
              "case2: the refusal carries kind=unauthenticated")
        check(detail_of(r).get("code") == "token_revoked",
              "case2: the refusal carries code=token_revoked")

        # The money path must refuse it too, and must refuse it BEFORE writing.
        blocked = bill_payload("blocked")
        r = post_bill(client, staff_token, blocked)
        print(f"  POST /bills with the SAME token   status={r.status_code}")
        print(f"    body: {json.dumps(body_of(r), ensure_ascii=False)}")
        check(r.status_code == 401, "case2: a revoked token cannot reach the money path")
        check(detail_of(r).get("code") == "token_revoked",
              "case2: the refused bill create carries code=token_revoked")

        # ------------------------------------------------------------------
        banner("CASE 3 - the user is NOT locked out: signing in again works")
        staff_token2 = login(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
        check(bool(staff_token2), "case3: the user can log in again after a revocation")
        if not staff_token2:
            return 1
        new_claim = claims_of(staff_token2).get("token_version")
        print(f"  new token's token_version claim = {new_claim}  (bump reported {v1})")
        check(new_claim == v1,
              "case3: the new token carries the version the bump reported")

        r = whoami(client, staff_token2)
        print(f"  GET /whoami with the NEW token    status={r.status_code}")
        check(r.status_code == 200, "case3: the new token is accepted (200)")

        # The refused bill was never written: the SAME idempotency key now
        # CREATES (201) rather than resolving to an existing bill (200). If the
        # 401 above had landed after the insert, this would be a 200.
        r = post_bill(client, staff_token2, blocked)
        print(f"  POST /bills, SAME key as the refused one  status={r.status_code}"
              f"  doc_no={body_of(r).get('doc_no')}")
        check(r.status_code == 201,
              "case3: the refused create wrote NOTHING (its key is still free: 201, not 200)")
        if r.status_code == 201:
            bills_created += 1

        # The delta, never the absolute. A second bump must return exactly one
        # more than the first.
        r = bump(client, admin_token, staff_id)
        v2 = body_of(r).get("token_version")
        print(f"  second bump returned {v2}, first returned {v1}")
        check(isinstance(v2, int) and isinstance(v1, int) and v2 == v1 + 1,
              "case3: two bumps move token_version by exactly one")

        staff_token3 = login(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
        check(bool(staff_token3) and whoami(client, staff_token3).status_code == 200,
              "case3: a session can be re-established after the second bump")

        # ------------------------------------------------------------------
        banner("CASE 4 - a token minted BEFORE 0005 (no version claim) is refused")
        legacy = pre_0005_token(staff_id, TENANT_A_ID, STAFF_USERNAME, "staff")
        print(f"  legacy token claims: {claims_of(legacy)}")
        check("token_version" not in claims_of(legacy),
              "case4: the legacy fixture genuinely carries NO token_version")
        r = whoami(client, legacy)
        print(f"  GET /whoami with a pre-0005 token  status={r.status_code}")
        print(f"    body: {json.dumps(body_of(r), ensure_ascii=False)}")
        check(r.status_code == 401, "case4: a pre-0005 token is REFUSED (401), not accepted")
        check(detail_of(r).get("kind") == "unauthenticated",
              "case4: the refusal carries kind=unauthenticated")
        check(detail_of(r).get("code") == "token_unversioned",
              "case4: a versionless token is refused as token_unversioned")

        # ------------------------------------------------------------------
        banner("CASE 5 - a bump is scoped to ONE user, across roles and tenants")
        # Peer in the SAME tenant: tenant A's admin has been bumping staff all
        # along and its own token must still work.
        r = whoami(client, admin_token)
        print(f"  tenant A ADMIN token after 2 bumps of staff   status={r.status_code}")
        check(r.status_code == 200,
              "case5: bumping staff leaves tenant A's ADMIN session working")

        # Another TENANT entirely.
        r = whoami(client, b_admin_token)
        print(f"  tenant B admin token after bumps in tenant A  status={r.status_code}")
        check(r.status_code == 200,
              "case5: a bump in tenant A leaves TENANT B's session working")

        # And the converse: bumping tenant B leaves tenant A alone.
        r = bump(client, b_admin_token, b_admin_id)
        print(f"  tenant B admin revokes ITSELF                 status={r.status_code}"
              f"  body={body_of(r)}")
        check(r.status_code == 200, "case5: self-revocation is allowed and answers 200")
        r = whoami(client, b_admin_token)
        print(f"  tenant B's own token after self-revocation    status={r.status_code}"
              f"  code={detail_of(r).get('code')}")
        check(r.status_code == 401 and detail_of(r).get("code") == "token_revoked",
              "case5: self-revocation ends the CALLER's own session")
        r = whoami(client, staff_token3)
        print(f"  tenant A staff token after tenant B's bump    status={r.status_code}")
        check(r.status_code == 200,
              "case5: a bump in tenant B leaves TENANT A's session working")

        # ------------------------------------------------------------------
        banner("CASE 6 - the endpoint itself: admin-only, and tenant-scoped by RLS")
        r = bump(client, staff_token3, staff_id)
        print(f"  STAFF caller on the bump endpoint  status={r.status_code}")
        print(f"    body: {json.dumps(body_of(r), ensure_ascii=False)}")
        check(r.status_code == 403, "case6: a STAFF caller is refused with 403")
        check(detail_of(r).get("kind") == "forbidden",
              "case6: the staff refusal carries kind=forbidden")
        check(detail_of(r).get("code") == "admin_required",
              "case6: the staff refusal carries code=admin_required")

        # A REAL user id, in another tenant. RLS makes the row invisible, so the
        # UPDATE matches nothing — there is no WHERE tenant_id anywhere in the
        # handler, which is the point of the check.
        r = bump(client, admin_token, b_admin_id)
        print(f"  tenant A admin bumping a TENANT B user id  status={r.status_code}")
        print(f"    body: {json.dumps(body_of(r), ensure_ascii=False)}")
        check(r.status_code == 404,
              "case6: a cross-tenant bump is refused with 404 (RLS, not a WHERE)")
        check(detail_of(r).get("code") == "user_not_found",
              "case6: the cross-tenant refusal carries code=user_not_found")

        # And it really was invisible rather than merely unchanged: tenant B's
        # user must still be able to sign in and work.
        b_again = login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)
        check(bool(b_again) and whoami(client, b_again).status_code == 200,
              "case6: the cross-tenant attempt left tenant B's user untouched")

        r = bump(client, admin_token, str(uuid.uuid4()))
        print(f"  bumping a user id that does not exist      status={r.status_code}")
        check(r.status_code == 404, "case6: an unknown user id is a 404")

    # ----------------------------------------------------------------------
    banner("CASE 7 - THE DISPROOF: the single line this proof rests on")
    print("""  server/app/auth.py, in get_principal:

      _require_live_session(token_version, row["token_version"])

  DELETE THAT ONE LINE and this proof must go RED. The code still parses and
  the server still starts — that is why the check is a helper call rather than
  an inline `if`, since deleting a `raise` out of an inline branch leaves an
  empty block and the server would not boot at all. A proof that goes red
  because nothing could run has measured nothing.

  With the line gone, CASE 2 turns green->red: the bumped token is accepted,
  /whoami answers 200, and POST /bills writes a bill under a revoked session.
  CASE 4 stays GREEN, because the versionless token is refused earlier, by
  claims["token_version"] raising KeyError. That split is itself informative —
  the two guards are independent and this proof can tell which one is missing.

  Run by hand, in this order, and keep both outputs:
    1. comment out that line, restart uvicorn, run this script  -> expect FAIL
    2. restore it, restart uvicorn, run this script twice       -> expect PASS""")

    banner("RESULT")
    print(f"  bills created by this run: {bills_created}"
          " (active, in tenant A — hard rule 5 means they stay)")
    if failures:
        print("  THESE CLAIMS DID NOT HOLD:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print("  ALL CASES PASSED - an issued token can be refused before it expires,")
    print("  the refusal is about the CALLER, and it is scoped to one user.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

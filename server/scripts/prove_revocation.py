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
  CASE 3  a BUMP does not lock the user out        -> a new login works
  CASE 4  a pre-0005 token is refused              -> 401 token_unversioned
  CASE 5  a bump is scoped to ONE user             -> A's peers and tenant B live
  CASE 6  the bump endpoint is admin-only and RLS-scoped -> 403 / 404
  CASE 6b GET /users NAMES a colleague             -> admin only, tenant-scoped
  CASE 7  a LOCKED account cannot sign in AT ALL   -> 401, and no token in the body
  CASE 8  unlocking restores it                    -> and the refused bill was never written
  CASE 9  the disproof: which lines, deleted, make this go red

CASE 3 AND CASE 7 ARE EACH OTHER'S NEGATION, which is why they belong in one
file. "A revoked user can sign in again the same second" and "a locked user
cannot sign in at all" are the two halves of one distinction, and split across
two scripts neither run would ever hold both.

THE SEAM CASE 6b OWNS, AND WHY IT IS IN THIS FILE
--------------------------------------------------
Every route in this module takes a user_id in the path. Until GET /users
existed, no response in this API produced another user's uuid at all - except
as a bare id on a bill header (purchase_bills.created_by / voided_by, only for
bills that have one, with no name attached and no route anywhere from a uuid to
a username). So all three capabilities were built, proven, and invokable only
by someone holding a database connection.

THIS SCRIPT COULD ONLY EVER TEST THEM BECAUSE IT LOGS IN AS EACH USER AND ASKS
/whoami. That is not a shortcut the product happens to lack: it is
structurally unavailable to the product's actual user, because a shop owner
dismissing an employee does not hold that employee's password. The proof had a
route to an id that the yard does not.

So what CASE 6b tests is not "a list comes back". It is that AN ADMIN CAN NAME
A COLLEAGUE, which is GET /users composed with POST /users/{id}/deactivate, and
neither half establishes it alone
(lessons/two-green-proofs-do-not-cover-the-seam.md). CASE 7 therefore locks the
account with the id THE ROSTER GAVE, never the one /whoami gave. That is what
makes the roster load-bearing rather than decorative: a list returning a
plausible but WRONG id does not fail as a shape here, it fails as a lock
landing on the wrong person.

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

WHAT IT LEAVES BEHIND: 3 active bills per run in tenant A (hard rule 5 — a
proof cannot delete a transaction), and the token_version of both tenant A
users and tenant B's admin raised by a few. Neither is a row the product could
not have produced; the bills are ordinary purchases and the counters are what
the endpoint is for. The bill count is printed in the summary.

AND ONE THING IT LEAVES BEHIND ONLY IF IT DIES: CASE 7 locks tenant A's staff
account and CASE 8 unlocks it. `check()` records a failure without raising, so
a failed assertion still reaches the unlock; an EXCEPTION between the two does
not, and the account stays locked, at which point run 2 cannot log in as staff
and fails for a reason that is not about the code. Clear it by hand —
POST /users/{staff_id}/activate as an admin — before re-running. Recorded here
rather than guarded with a finally: the unlock is itself one of the six claims
(CASE 8), and a teardown that silently performed it would be doing the thing
the assertion is supposed to observe.

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
    TENANT_B_STAFF_PASSWORD,
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


def login_raw(
    client: httpx.Client, tenant_id, username: str, password: str
) -> httpx.Response:
    """The whole response, because CASE 7 asserts on what is NOT in the body.

    A login that is refused must carry no access_token, and a check that only
    reads the status cannot see one that does. Asserting the absence needs the
    body, so the raw response is the primitive and login() is the convenience.
    """
    return client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": username, "password": password},
    )


def login(client: httpx.Client, tenant_id, username: str, password: str) -> str | None:
    r = login_raw(client, tenant_id, username, password)
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


def set_active(
    client: httpx.Client, admin_token: str, user_id: str, active: bool
) -> httpx.Response:
    """Lock or unlock an account through the real endpoint (migration 0007).

    One helper for both verbs on purpose: the pair is the claim. A deactivate
    with no activate would leave this script unable to run twice, which is the
    bar every proof here is held to.
    """
    verb = "activate" if active else "deactivate"
    return client.post(f"{BASE}/users/{user_id}/{verb}", headers=auth(admin_token))


def list_users(
    client: httpx.Client, token: str, include_inactive: bool = False
) -> httpx.Response:
    """The roster. THE WHOLE RESPONSE, because CASE 6b asserts on the bytes.

    Same reason login_raw exists rather than only login(): two of the claims are
    about what is NOT in the body, and a helper returning parsed JSON would have
    thrown the evidence away before any assertion could look at it.
    """
    query = "?include_inactive=true" if include_inactive else ""
    return client.get(f"{BASE}/users{query}", headers=auth(token))


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
        admin_id = body_of(whoami(client, admin_token)).get("user_id")
        b_admin_id = body_of(whoami(client, b_admin_token)).get("user_id")
        print(f"  run tag        : {RUN}")
        print(f"  tenant A staff : {staff_id}")
        print(f"  tenant A admin : {admin_id}")
        print(f"  tenant B admin : {b_admin_id}")
        print(f"  staff token claims: {claims_of(staff_token)}")
        if not (staff_id and admin_id and b_admin_id):
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

        # ------------------------------------------------------------------
        banner("CASE 6b - GET /users: the roster that makes the three routes reachable")
        # See THE SEAM CASE 6b OWNS in the module docstring. The id this case
        # produces is the id CASE 7 locks with.
        r_roster = list_users(client, admin_token)
        roster = body_of(r_roster).get("users", [])
        print(f"  GET /users as tenant A ADMIN  status={r_roster.status_code}"
              f"  entries={len(roster)}")
        for u in roster:
            # ensure_ascii=True: a real shop's names are Thai, and this box is
            # codepage 874. Escapes keep the log readable wherever it is opened.
            print(f"    {json.dumps(u, ensure_ascii=True, sort_keys=True)}")
        check(r_roster.status_code == 200,
              "case6b: an admin can list the shop's users (200)")

        # THE LOOKUP IS GUARDED BY ITS OWN CELL, BEFORE THE ID IS USED ANYWHERE.
        # next(..., None) rather than next(), and then a check on the result: a
        # miss must RECORD a failure and let the run continue. Letting
        # StopIteration escape would kill the script inside CASE 7, between the
        # lock and the unlock, and leave the staff account LOCKED - the hazard
        # this module's docstring records under WHAT IT LEAVES BEHIND ONLY IF IT
        # DIES, arriving through a new door.
        listed = next(
            (u for u in roster if u.get("username") == STAFF_USERNAME), None
        )
        check(listed is not None,
              "case6b: the roster carries an entry for the staff username")
        listed_staff_id = listed.get("user_id") if listed is not None else None

        # BOTH SIDES DERIVED, NEITHER A LITERAL. listed_staff_id came from the
        # ADMIN's GET /users; staff_id came from the STAFF session's own /whoami
        # at SETUP - a different request, on a different token, minted from a
        # different login. Neither is a constant out of seeddata: the 2026-08-03
        # rebuild gave every seeded user a new id, so a literal here would be
        # measuring the fixture. This is the cell that can come out the other
        # way (lessons/a-differential-control-is-only-as-good-as-its-weaker-
        # side.md), which is the whole reason both halves are read off responses.
        print(f"  roster says   staff user_id = {listed_staff_id}")
        print(f"  /whoami said  staff user_id = {staff_id}")
        check(listed_staff_id == staff_id,
              "case6b: the id on the roster IS the id /whoami gave that session")

        # THE TIER. GET /users is require_admin, which BREAKS the convention
        # every other list route in this API follows - uoms, product-categories,
        # products, sellers and bills are all get_principal. Nothing else in
        # this file makes a call with a staff token after CASE 6, so without
        # these three cells the tier would be held by review rather than by
        # measurement, and widening it would be invisible to every other cell.
        r_staff_roster = list_users(client, staff_token3)
        print(f"  GET /users as tenant A STAFF  status={r_staff_roster.status_code}"
              f"  kind={detail_of(r_staff_roster).get('kind')!r}"
              f"  code={detail_of(r_staff_roster).get('code')!r}")
        check(r_staff_roster.status_code == 403,
              "case6b: a STAFF caller is refused the roster with 403")
        check(detail_of(r_staff_roster).get("kind") == "forbidden",
              "case6b: the staff roster refusal carries kind=forbidden")
        check(detail_of(r_staff_roster).get("code") == "admin_required",
              "case6b: the staff roster refusal carries code=admin_required")

        # THE TENANT CONTROL, and its peer is the sharpest one available for the
        # same reason CASE 7's login control is: tenant B holds a user with the
        # SAME username, since uq_users_tenant_username makes usernames unique
        # only per tenant. A roster resolved by username rather than by tenant
        # context would hand back B's staff here, and this is what catches it.
        #
        # b_again, NOT b_admin_token. CASE 5 had tenant B's admin revoke ITSELF
        # to prove self-revocation ends the caller's own session, so that token
        # is deliberately dead by now and CASE 6 minted a fresh one. Written
        # down because the first run of this case used the dead token and the
        # POSITIVE CONTROL below is what caught it: the "absent from B's roster"
        # cell passed VACUOUSLY against a 401 and an empty list, which is the
        # exact failure that control exists for.
        r_b_roster = list_users(client, b_again)
        b_roster = body_of(r_b_roster).get("users", [])
        b_ids = {u.get("user_id") for u in b_roster}
        print(f"  GET /users as tenant B ADMIN  status={r_b_roster.status_code}"
              f"  entries={len(b_roster)}"
              f"  usernames={sorted(str(u.get('username')) for u in b_roster)}")
        check(r_b_roster.status_code == 200,
              "case6b: tenant B's admin gets a roster of its own (200)")
        check(listed_staff_id is not None and listed_staff_id not in b_ids,
              "case6b: tenant A's staff is ABSENT from tenant B's roster")
        # THE POSITIVE CONTROL. Without it, "absent from B's roster" is
        # satisfied by an endpoint returning an empty list to everybody, and
        # every cell above would still hold.
        check(b_admin_id in b_ids,
              "case6b: tenant B's roster carries tenant B's OWN admin")

        # ON THE RAW BYTES. Not on parsed keys - a key absent from a dict says
        # nothing about the same string sitting elsewhere in the body - and not
        # on decoded text, because this box is codepage 874 and anything decoded
        # through the locale default is a rendering artefact rather than an
        # observation (lessons/console-is-not-the-observation.md). Bytes need no
        # codec to be believed.
        for label, resp in (("tenant A", r_roster), ("tenant B", r_b_roster)):
            check(b"password_hash" not in resp.content,
                  f"case6b: the {label} roster body carries no password_hash anywhere")
            check(b"token_version" not in resp.content,
                  f"case6b: the {label} roster body carries no token_version anywhere")

        # ------------------------------------------------------------------
        banner("CASE 7 - a LOCKED account cannot sign in at all (migration 0007)")
        # The account under test is tenant A's staff user, and CASE 8 unlocks it.
        # See WHAT IT LEAVES BEHIND ONLY IF IT DIES in the module docstring.
        #
        # staff_token3 was minted in CASE 3 carrying version v2 and was still
        # answering 200 in CASE 5, so it is a LIVE session at this point. Holding
        # it across the lock is what lets this case show a lock ending a session
        # that already exists, rather than only refusing a new one.
        pre_lock_token = staff_token3

        # THE ROSTER'S ID, NOT /whoami's, AND THAT IS THE SEAM. If GET /users
        # hands back a plausible but wrong uuid, this lock lands on the wrong
        # row - or on nothing - and CASE 7's own cells go red without one of
        # them being about a list. That is what makes the roster load-bearing
        # here rather than a shape asserted once and then set aside.
        r = set_active(client, admin_token, listed_staff_id, False)
        locked_body = body_of(r)
        v_lock = locked_body.get("token_version")
        print(f"  POST /users/{{id}}/deactivate  status={r.status_code}  body={locked_body}")
        check(r.status_code == 200, "case7: the deactivate endpoint answers 200")
        check(locked_body.get("is_active") is False,
              "case7: the admin's OWN response reports the account is now inactive")
        # A DELTA, never an absolute. v2 is what the last bump REPORTED, so this
        # asserts the lock performed the revocation too — in the same statement,
        # which is the whole reason the two move together.
        check(isinstance(v_lock, int) and isinstance(v2, int) and v_lock == v2 + 1,
              "case7: locking bumped token_version by exactly one (delta, not absolute)")

        # --- THE DONE-WHEN: a locked account is refused at login. -----------
        r = login_raw(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
        locked_login = body_of(r)
        print(f"  POST /auth/login, CORRECT password  status={r.status_code}")
        print(f"    body: {json.dumps(locked_login, ensure_ascii=False)}")
        check(r.status_code == 401,
              "case7: a locked account is REFUSED at login even with the CORRECT password")
        # Asserting the ABSENCE, not only the status. A 401 carrying a usable
        # token would satisfy a status-only check and hand out a session.
        check("access_token" not in locked_login,
              "case7: the refused login body carries NO access_token")

        # The refusal must be indistinguishable from a wrong password. BOTH
        # sides are read off real responses — neither is a literal, so this can
        # come out the other way (lessons/a-differential-control-is-only-as-good
        # -as-its-weaker-side.md).
        r_wrong = login_raw(client, TENANT_A_ID, STAFF_USERNAME, "totally-wrong-password")
        print(f"  the same login with a WRONG password  status={r_wrong.status_code}"
              f"  body={json.dumps(body_of(r_wrong), ensure_ascii=False)}")
        check(r.status_code == r_wrong.status_code and locked_login == body_of(r_wrong),
              "case7: the locked refusal is INDISTINGUISHABLE from a wrong password")

        # --- the live session it was holding is dead too --------------------
        r = whoami(client, pre_lock_token)
        print(f"  GET /whoami with the PRE-LOCK token   status={r.status_code}"
              f"  code={detail_of(r).get('code')}")
        check(r.status_code == 401, "case7: the token held before the lock is refused")
        # THE CODE, NOT THE STATUS, AND THIS IS THE CELL THAT CARRIES MUTATION B.
        # Both guards in get_principal are true of this request: the account is
        # inactive AND the version is stale, because the lock did both in one
        # statement. _require_active_account runs FIRST, so the code names the
        # durable fact. Delete that line and this request is STILL 401 — it falls
        # through to _require_live_session and comes back token_revoked. A
        # status-only assertion here would stay green with the guard gone.
        check(detail_of(r).get("code") == "account_inactive",
              "case7: the refusal names the ACCOUNT (account_inactive), not the token")

        # --- and it cannot reach the money path -----------------------------
        locked_bill = bill_payload("locked")
        r = post_bill(client, pre_lock_token, locked_bill)
        print(f"  POST /bills with the PRE-LOCK token   status={r.status_code}"
              f"  code={detail_of(r).get('code')}")
        check(r.status_code == 401, "case7: a locked account cannot reach the money path")
        check(detail_of(r).get("code") == "account_inactive",
              "case7: the refused bill create names the account, not the token")

        # --- THE POSITIVE CONTROL -------------------------------------------
        # Without this, "login answers 401" is satisfiable by a server that has
        # simply stopped letting anyone in, and every assertion above would hold.
        r = whoami(client, admin_token)
        print(f"  tenant A ADMIN token after locking staff   status={r.status_code}")
        check(r.status_code == 200,
              "case7: locking staff leaves tenant A's ADMIN session working")
        r = login_raw(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
        check(r.status_code == 200 and "access_token" in body_of(r),
              "case7: tenant A's admin can still SIGN IN while staff is locked")
        # The sharpest peer available: tenant B's staff carries the SAME username
        # as the locked account. Locking is per ROW, and usernames are unique only
        # per tenant (uq_users_tenant_username), so this is the one control that
        # would catch a lock applied by username instead of by id.
        r = login_raw(client, TENANT_B_ID, STAFF_USERNAME, TENANT_B_STAFF_PASSWORD)
        print(f"  tenant B's 'staff' (SAME username) signing in  status={r.status_code}")
        check(r.status_code == 200 and "access_token" in body_of(r),
              "case7: another shop's user with the SAME username still signs in")

        # --- the two guards on the endpoint itself --------------------------
        # Beyond the six claims, and here because a guard nothing exercises is a
        # guard whose green carries no information.
        r = set_active(client, admin_token, admin_id, False)
        print(f"  admin deactivating ITSELF   status={r.status_code}"
              f"  code={detail_of(r).get('code')}")
        check(r.status_code == 403, "case7: an admin cannot deactivate its OWN account")
        check(detail_of(r).get("code") == "cannot_deactivate_self",
              "case7: the self-lock refusal carries code=cannot_deactivate_self")
        check(whoami(client, admin_token).status_code == 200,
              "case7: the refused self-lock changed nothing — the admin still works")

        r = set_active(client, admin_token, b_admin_id, False)
        print(f"  tenant A admin locking a TENANT B user id   status={r.status_code}")
        check(r.status_code == 404,
              "case7: a cross-tenant lock is refused 404 (RLS, not a hand-written WHERE)")
        check(bool(login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)),
              "case7: the cross-tenant lock attempt left tenant B's admin untouched")

        # ------------------------------------------------------------------
        banner("CASE 8 - unlocking restores the account, and the refused bill was never written")
        # The SAME id the lock used, necessarily: unlocking a different row
        # would leave whatever CASE 7 actually locked still locked.
        r = set_active(client, admin_token, listed_staff_id, True)
        unlocked_body = body_of(r)
        print(f"  POST /users/{{id}}/activate  status={r.status_code}  body={unlocked_body}")
        check(r.status_code == 200, "case8: the activate endpoint answers 200")
        check(unlocked_body.get("is_active") is True,
              "case8: the response reports the account is active again")
        check(unlocked_body.get("token_version") == v_lock,
              "case8: unlocking does NOT bump the version — there are no sessions to end")

        staff_token4 = login(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
        check(bool(staff_token4), "case8: the account can sign in again once unlocked")
        if not staff_token4:
            return 1
        check(claims_of(staff_token4).get("token_version") == v_lock,
              "case8: the new token carries the version the lock left behind")
        r = whoami(client, staff_token4)
        print(f"  GET /whoami with the restored session  status={r.status_code}")
        check(r.status_code == 200, "case8: the restored session is accepted (200)")

        # The bill refused under the lock was never written: the SAME idempotency
        # key now CREATES (201) rather than resolving to an existing bill (200).
        # If the 401 had landed after the insert, this would be a 200.
        r = post_bill(client, staff_token4, locked_bill)
        print(f"  POST /bills, SAME key as the one refused under the lock  "
              f"status={r.status_code}  doc_no={body_of(r).get('doc_no')}")
        check(r.status_code == 201,
              "case8: the bill refused under the lock wrote NOTHING (its key is still free: 201, not 200)")
        if r.status_code == 201:
            bills_created += 1

    # ----------------------------------------------------------------------
    banner("CASE 9 - THE DISPROOF: the lines this proof rests on")
    print("""  THREE LINES, IN TWO FILES, AND EACH ONE HAS ITS OWN MUTATION. Every one of
  them is a helper CALL rather than an inline `if`, so deleting it leaves the
  module parsable and the server bootable: "the check is gone" and "nobody could
  run the check" must never share an outcome.

  RUN EVERY MUTATION AGAINST A RESTORED SCRATCH DATABASE, NEVER DEV. Mutations
  A, B and C all end with CASE 7 posting a bill under an account that is not
  actually locked - A and B by removing a guard, C without touching a guard at
  all, by sending the lock to a uuid that names nobody. That POST then SUCCEEDS
  and writes a
  schema-valid, FK-satisfying, reconcile-clean bill that the correct product
  could not have produced, which hard rule 5 makes unremovable. Ten such rows
  are already in the dev database from the created_by work — see
  lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md.
  Establish WHICH CODE IS RUNNING BY A RESPONSE before and after each edit; a
  process list is not that observation.

  ---- MUTATION 0 (0005) : server/app/auth.py, in get_principal --------------
      _require_live_session(token_version, row["token_version"])
  RED: CASE 2 — the bumped token is accepted, /whoami answers 200, and
  POST /bills writes a bill under a revoked session.
  GREEN: CASE 4, because a versionless token is refused earlier by
  claims["token_version"] raising KeyError. CASE 7 also stays green, because a
  locked account is refused by the OTHER guard and by login.

  ---- MUTATION A (0007) : server/app/main.py, in login ---------------------
      if not row["is_active"]:
          raise _INVALID_LOGIN
  RED: CASE 7's login cells — a locked account is issued a token. The two that
  fire are "refused at login with the correct password" and "the refused login
  body carries NO access_token", and the indistinguishability check goes red
  with them, since a 200 and a 401 are not the same response.
  GREEN: everything about the TOKEN — the pre-lock token is still refused, the
  money path is still refused, and CASE 8 still restores. That split is the
  information: it says the lock is missing from LOGIN and present in
  get_principal.

  ---- MUTATION B (0007) : server/app/auth.py, in get_principal -------------
      _require_active_account(row["is_active"])
  RED: exactly the two cells that read the CODE — "the refusal names the ACCOUNT
  (account_inactive), not the token" on /whoami and on POST /bills.
  GREEN: every STATUS in CASE 7, and this is the point. Deactivation bumps
  token_version in the same statement, so the pre-lock token is ALSO stale and
  _require_live_session refuses it anyway — still 401, only the code changes,
  from account_inactive to token_revoked. AN ASSERTION ON THE STATUS ALONE
  WOULD STAY GREEN WITH THIS GUARD DELETED. That is why the guard is ordered
  before the version check and why these two cells read `code`.

  ---- MUTATION C (the roster) : server/app/users.py, _USER_SELECT ----------
      SELECT tenant_id AS id, username, full_name, role, is_active FROM users
  The id resolves from the wrong column. EVERY SHAPE STAYS RIGHT: the row
  count, the usernames, the full names, the roles, is_active, both tenant
  controls and both byte checks. A proof that asserted the shape of a list
  would be FULLY GREEN over it.
  EXECUTED 2026-08-07 against a scratch copy: exit 1, 54 OK / 16 FAIL. (Those
  counts are written WITHOUT brackets on purpose: a bracketed tag in prose is
  counted as a cell by any grep over this script's output, which is a trap
  proveSignOut already paid for once.)
  RED: case6b's "the id on the roster IS the id /whoami gave"; case6b's POSITIVE
  CONTROL "tenant B's roster carries tenant B's OWN admin"; and then FOURTEEN
  cells across CASE 7 and CASE 8 in a cascade, because the lock is sent to a
  uuid that names no user.
  GREEN: the lookup cell, the three tier cells, "tenant A's staff is ABSENT from
  tenant B's roster", and all four byte checks.

  A WRITTEN PREDICTION WAS CORRECTED BY THIS RUN, and it is left corrected here
  rather than quietly fixed. It said BOTH tenant cells would stay green. The
  POSITIVE CONTROL fired instead - it asserts on an id too, and every id in
  tenant B's roster was equally wrong. Only the disjointness cell survived, and
  the reason it survived is the part worth keeping: it compared two WRONG ids
  that happened to differ, so under this mutation it was true BY ACCIDENT rather
  than by the property it names. That is precisely the weaker side of a paired
  control (lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md),
  and it was found by RUNNING the mutation, not by reasoning about it.

  ---- MUTATION D (the tier) : server/app/users.py, list_users -------------
      principal: Principal = Depends(require_admin)
  changed to Depends(get_principal). EXECUTED 2026-08-07 against a scratch copy:
  exit 1, 67 OK / 3 FAIL, and the three are case6b's tier cells - NOTHING
  else moved. Every other call in this file is made with an admin token, so a
  widened gate is invisible to all of them, and without those three the tier is
  a decision no instrument measures.

  NOTE: get_principal is NOT imported by users.py, so this mutation must add it
  to the `from .auth import ...` line. Left as a bare name it is a NameError at
  import, uvicorn never boots, and every cell fails for a reason that is not the
  mutation - which is the outcome the paragraph at the top of this case forbids.

  Run each by hand, in this order, and keep every output:
    1. restore a scratch copy, point uvicorn at it, confirm by a response
    2. apply ONE mutation, restart uvicorn, confirm by a response, run this
       script -> expect the cells above and only those
    3. revert, prove the revert by HASH, restart, run this script twice
       -> expect PASS""")

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

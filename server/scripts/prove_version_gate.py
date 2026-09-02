"""Prove the API version gate over real HTTP (server/app/version_gate.py).

Model on prove_login_guard.py: restore a SCRATCH from a live dump, start a child
uvicorn on it, gate on /openapi.json before any cell, then exercise the version
middleware. The gate touches no business data and this proof writes no rows; the
scratch exists only so the child's startup watermark write (clock_guard) never
lands on the live database.

THE FLOOR IS DRIVEN BY A FILE THIS PROOF OWNS. The child is started with
CLIENT_API_VERSION_FLOOR_FILE pointing at a per-run temp path; this proof creates,
raises and removes that file DURING the run, against the SAME child, so "the floor
rises without a restart" is proven by one process changing its verdict — not by
restarting it.

THIS PROOF SHARES NO CODE WITH THE GATE. The header name and the refusal's
kind/code are pinned here as LITERALS, not imported: they ARE the contract a
client depends on, so a server-side rename must REDDEN this proof. The judgement
(too old iff below the floor) is never imported either — it is re-derived by
writing a floor value and observing the status the real path returns
(a-checker-must-not-share-the-code-it-checks).

The three disproofs the brief names are run by hand against the middleware in
main.py, each naming its cell first:
  (a) widen the exempt set (exempt /products too) -> B1 goes 401, not 426
  (b) read the floor once at import (cache it)     -> B_FLIP stays 401 after the raise
  (c) return 401 instead of 426                    -> B_DISTINCT (status != 426)

Green TWICE in a row with --skip-restore between: this proof writes no rows and
resets its own floor file at the start, so run 2 is independent of run 1
(proof-must-run-twice).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

# THE CONTRACT, PINNED AS LITERALS (not imported from version_gate — see the
# docstring). A rename on the server must break this proof.
HEADER = "x-client-api-version"
EXPECT_KIND = "client_outdated"
EXPECT_CODE = "client_api_version_unsupported"
UPGRADE_REQUIRED = 426
UNAUTHORIZED = 401
GATED_ROUTE = "/products"  # requires get_principal; no token -> 401 AT the auth layer

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = "recycle_version_gate_scratch"
RUN = uuid.uuid4().hex[:8]

BASE = ""
failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _tail(path: str, n: int = 40) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return "(no child log)"


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-versiongate-dump-{RUN}")
    label = f"versiongate-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")
    shutil.rmtree(out, ignore_errors=True)


def wait_for_health(proc: subprocess.Popen, timeout: float = 40.0) -> str:
    import time
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            r = httpx.get(f"{BASE}/health", timeout=2.0)
            if r.status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


def assert_serving_this_code() -> str:
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    paths = r.json().get("paths", {})
    if "get" not in paths.get(GATED_ROUTE, {}):
        return f"the server does not declare GET {GATED_ROUTE}"
    if "get" not in paths.get("/health", {}):
        return "the server does not declare GET /health"
    return ""


# ---------------------------------------------------------------------------
# floor-file control: this proof OWNS the file the child reads per request.
# ---------------------------------------------------------------------------
FLOOR_PATH = ""  # set in main(), before the child is started


def set_floor(value: int | None) -> None:
    """Raise/lower the floor, or (None) remove the file entirely (-> default)."""
    if value is None:
        try:
            os.unlink(FLOOR_PATH)
        except OSError:
            pass
        return
    with open(FLOOR_PATH, "w", encoding="utf-8") as f:
        f.write(str(value))


def v_header(version: int | None) -> dict:
    return {} if version is None else {HEADER: str(version)}


async def get_products(client: httpx.AsyncClient, version: int | None) -> httpx.Response:
    # No Authorization header: a version-admitted request reaches get_principal
    # and is refused 401 AT THE AUTH LAYER; a too-old one is refused 426 BEFORE it.
    return await client.get(GATED_ROUTE, headers=v_header(version))


async def get_health(client: httpx.AsyncClient, version: int | None) -> httpx.Response:
    return await client.get("/health", headers=v_header(version))


def kind_of(r: httpx.Response) -> str | None:
    try:
        detail = r.json().get("detail")
    except Exception:  # noqa: BLE001
        return None
    return detail.get("kind") if isinstance(detail, dict) else None


async def run(client: httpx.AsyncClient) -> None:
    header("PHASE A — floor at the default (no floor file). Floor 0 admits everyone.")
    set_floor(None)
    a1 = await get_products(client, 1)
    check(a1.status_code == UNAUTHORIZED and kind_of(a1) == "unauthenticated",
          "A1: a current client (version 1) PASSES the gate -> 401 at the auth layer, kind unauthenticated")
    a2 = await get_products(client, None)
    check(a2.status_code == UNAUTHORIZED and kind_of(a2) == "unauthenticated",
          "A2: a header-LESS client (the pre-contract build) is ADMITTED at floor 0 -> 401 at the auth layer")
    a3 = await get_health(client, None)
    check(a3.status_code == 200, "A3: /health answers 200 (exempt, and floor 0 admits anyway)")

    header("PHASE B — RAISE the floor to 1 on the SAME child, by writing the file.")
    set_floor(1)
    b1 = await get_products(client, None)
    check(b1.status_code == UPGRADE_REQUIRED,
          "B1: a too-old (header-less -> version 0) client on a gated route is REFUSED 426")
    detail = b1.json().get("detail") if b1.status_code == UPGRADE_REQUIRED else {}
    detail = detail if isinstance(detail, dict) else {}
    check(detail.get("kind") == EXPECT_KIND and detail.get("code") == EXPECT_CODE,
          f"B2: the 426 body names kind={EXPECT_KIND!r} code={EXPECT_CODE!r}")
    check(detail.get("min_client_api_version") == 1 and detail.get("client_api_version") == 0
          and isinstance(detail.get("min_client_api_version"), int)
          and isinstance(detail.get("client_api_version"), int),
          "B3: the body carries machine-readable INTEGERS (min=1, client=0) — no prose the client must parse")

    b_flip_before = a2.status_code            # the SAME header-less request, before the raise
    b_flip_after = b1.status_code             # ...and after
    check(b_flip_before == UNAUTHORIZED and b_flip_after == UPGRADE_REQUIRED,
          "B_FLIP: the identical header-less client went 401 (floor 0) -> 426 (floor 1) with NO restart — the floor is read per request")

    check(b1.status_code == UPGRADE_REQUIRED and b1.status_code != UNAUTHORIZED
          and kind_of(b1) == EXPECT_KIND and kind_of(b1) != "unauthenticated",
          "B_DISTINCT: the refusal is 426/client_outdated, NOT the 401/unauthenticated the sign-in screen renders on")

    b4 = await get_products(client, 0)
    check(b4.status_code == UPGRADE_REQUIRED,
          "B4: an explicit version 0 (0 < 1) is refused 426")
    b5 = await get_products(client, 1)
    check(b5.status_code == UNAUTHORIZED and kind_of(b5) == "unauthenticated",
          "B5: version 1 (== floor) is ADMITTED -> 401 at the auth layer")
    b6 = await get_products(client, 2)
    check(b6.status_code == UNAUTHORIZED and kind_of(b6) == "unauthenticated",
          "B6: version 2 (> floor) is ADMITTED -> 401 at the auth layer")
    b7 = await get_health(client, 0)
    check(b7.status_code == 200,
          "B7: /health answers 200 to a TOO-OLD client — the exempt path lets it learn the server is up")

    header("PHASE C — the floor is read live BOTH ways. Remove the file -> default 0.")
    set_floor(None)
    c1 = await get_products(client, None)
    check(c1.status_code == UNAUTHORIZED and kind_of(c1) == "unauthenticated",
          "C1: removing the floor file re-admits the header-less client -> 401, no restart (read live both ways)")

    header("PHASE D — a corrective LOWER floor, SAME byte size, is honoured at once (finding 7).")
    # Red-team finding 7: the old (mtime_ns, size) cache could mask a corrective
    # write, because every floor value is one byte so size never discriminated and
    # a back-to-back same-size write shared the mtime tick ~85% of the time on this
    # box. The fix reads the file CONTENT every request. Here: raise to 2, then
    # LOWER to 1 (both one byte) and require the lower to take effect on the very
    # next request. With the fix this is deterministic; a reintroduced cache would
    # redden it whenever the two writes collide.
    set_floor(2)
    d1 = await get_products(client, 1)
    check(d1.status_code == UPGRADE_REQUIRED,
          "D1: floor 2 refuses a version-1 client (1 < 2)")
    set_floor(1)  # same 1-byte size, written straight after
    d2 = await get_products(client, 1)
    check(d2.status_code == UNAUTHORIZED and kind_of(d2) == "unauthenticated",
          "D2: the corrective LOWER floor (2 -> 1, same byte size) is honoured on the NEXT request — version 1 is now ADMITTED; no cache masks it")
    set_floor(None)


async def main() -> int:
    global BASE, FLOOR_PATH
    ap = argparse.ArgumentParser(description="Prove the API version gate over real HTTP.")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r} from a live dump. Never live.")
    ap.add_argument("--skip-restore", action="store_true")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database

    scratch = args.database or SCRATCH_DB
    if scratch == live_name:
        print(f"REFUSED: the scratch name {scratch!r} equals the live database.")
        return 2

    if not args.skip_restore:
        print(f"  restoring scratch {scratch!r} from a live dump of {live_name!r}...")
        try:
            restore_scratch(live_name, scratch)
        except Exception as exc:  # noqa: BLE001
            print(f"REFUSED: could not restore the scratch: {exc}")
            return 2

    os.environ["APP_DATABASE_URL"] = app_live.set(database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=scratch).render_as_string(hide_password=False)

    # The floor file the CHILD reads per request. A per-run temp path, handed to
    # the child via env BEFORE it starts, and owned entirely by this proof.
    floor_dir = tempfile.mkdtemp(prefix=f"prove_version_gate_{RUN}_")
    FLOOR_PATH = os.path.join(floor_dir, "api_version_floor")
    set_floor(None)  # start clean, so the child boots at the default floor
    os.environ["CLIENT_API_VERSION_FLOOR_FILE"] = FLOOR_PATH

    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_version_gate_", delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r}")
    print(f"  floor file: {FLOOR_PATH} (log {log.name})")

    try:
        why = wait_for_health(proc)
        if why:
            print(_tail(log.name))
            check(False, f"E0: server started -- {why}")
            return 1
        wrong = assert_serving_this_code()
        if wrong:
            check(False, f"E0: serving THIS code -- {wrong}")
            return 1
        check(True, f"E0: /openapi.json declares GET {GATED_ROUTE} and GET /health")

        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            await run(client)

        print("\n" + "=" * 72)
        print(f"  passes={len(passes)}  failures={len(failures)}")
        for f in failures:
            print(f"    RED: {f}")
        return 1 if failures else 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
        try:
            os.unlink(log.name)
        except OSError:
            pass
        shutil.rmtree(floor_dir, ignore_errors=True)


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_VERSION_GATE_EXIT={rc}")
    sys.exit(rc)

"""Prove the API's CORS policy (ADVISOR-DECIDED D-2; ROADMAP P1.6 and D7) over real HTTP.

    uv run python scripts/prove_cors.py      (self-restores a scratch from a live dump)

The desktop renderer is served from the privileged scheme app://recycle, and Electron's fetch
from it sends `Origin: app://recycle` -- MEASURED by desktop `npm run prove:origin` before this
allowlist was written. The allowlist names EXACTLY that origin: never `*`, never `null` (the
file:// value every sandboxed iframe also presents). No dev server exists, so no localhost
origin is named either.

THE CELLS, each a raw response's headers:
  E0  the child serves THIS code: an allowed preflight is answered at all
  A1  a PREFLIGHT from app://recycle for GET /bills with Authorization and the client-version
      header -> 200, Access-Control-Allow-Origin app://recycle, both headers allowed
  A2  a simple GET /health from app://recycle -> Access-Control-Allow-Origin app://recycle
  A3  a 401 (GET /whoami, no token) from app://recycle still carries the allow-origin header,
      so the renderer can READ the refusal and show sign-in rather than a network error
  F1  a preflight from a FOREIGN origin is refused: no allow-origin header
  F2  a GET from a foreign origin carries no allow-origin header (the browser blocks the read)
  F3  Origin "null" is refused the same way (preflight and GET)
  F4  no response in this run ever carried `*`
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402
SCRATCH_DB = scratch_name("recycle_cors_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)

DESKTOP = "app://recycle"
FOREIGN = "http://evil.example"
ACAO = "access-control-allow-origin"

failures: list[str] = []
passes: list[str] = []
seen_acao: list[str] = []


def check(cond: bool, label: str) -> None:
    (passes if cond else failures).append(label)
    print(f"  [{'OK  ' if cond else 'RED '}] {label}")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def restore_scratch(live: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-cors-dump-{RUN}")
    label = f"cors-{RUN}"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "backup_db.py"), "--db", live, "--out", out,
                         "--label", label], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
                        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py failed: {(cp.stdout + cp.stderr)[-600:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    cp = subprocess.run([sys.executable, os.path.join("scripts", "restore_db.py"), os.path.join(out, dumps[0]),
                         "--into", SCRATCH_DB], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
                        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py failed: {(cp.stdout + cp.stderr)[-600:]}")
    shutil.rmtree(out, ignore_errors=True)


def note(r: httpx.Response) -> httpx.Response:
    if ACAO in r.headers:
        seen_acao.append(r.headers[ACAO])
    return r


def preflight(base: str, origin: str, path: str = "/bills") -> httpx.Response:
    return note(httpx.request("OPTIONS", f"{base}{path}", timeout=10, headers={
        "Origin": origin, "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-client-api-version"}))


def get(base: str, origin: str, path: str) -> httpx.Response:
    return note(httpx.get(f"{base}{path}", timeout=10, headers={"Origin": origin}))


def run_cells(base: str) -> None:
    pre = preflight(base, DESKTOP)
    check(pre.status_code == 200, f"E0/A1 an allowed preflight is answered 200 (got {pre.status_code})")
    allowed_headers = pre.headers.get("access-control-allow-headers", "").lower()
    check(pre.headers.get(ACAO) == DESKTOP and "authorization" in allowed_headers
          and "x-client-api-version" in allowed_headers,
          f"A1 preflight from {DESKTOP}: allow-origin {pre.headers.get(ACAO)!r},"
          f" allow-headers {allowed_headers!r}")
    h = get(base, DESKTOP, "/health")
    check(h.status_code == 200 and h.headers.get(ACAO) == DESKTOP,
          f"A2 GET /health from {DESKTOP}: {h.status_code}, allow-origin {h.headers.get(ACAO)!r}")
    w = get(base, DESKTOP, "/whoami")
    check(w.status_code == 401 and w.headers.get(ACAO) == DESKTOP,
          f"A3 a 401 still carries allow-origin so the renderer can read it: {w.status_code},"
          f" {w.headers.get(ACAO)!r}")
    fp = preflight(base, FOREIGN)
    check(ACAO not in fp.headers and fp.status_code != 200,
          f"F1 preflight from {FOREIGN}: {fp.status_code}, no allow-origin ({fp.headers.get(ACAO)!r})")
    fg = get(base, FOREIGN, "/health")
    check(ACAO not in fg.headers, f"F2 GET from {FOREIGN} carries no allow-origin ({fg.headers.get(ACAO)!r})")
    np = preflight(base, "null")
    ng = get(base, "null", "/health")
    check(ACAO not in np.headers and ACAO not in ng.headers and np.status_code != 200,
          f"F3 Origin null refused: preflight {np.status_code} {np.headers.get(ACAO)!r},"
          f" GET {ng.headers.get(ACAO)!r}")
    check("*" not in seen_acao and len(seen_acao) >= 3,
          f"F4 no response carried '*' (allow-origin values seen: {seen_acao})")


def main() -> int:
    app_live = make_url(os.environ["APP_DATABASE_URL"])
    if SCRATCH_DB == app_live.database:
        print("REFUSED: scratch equals live")
        return 2
    try:
        restore_scratch(app_live.database)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    env = dict(ORIG_ENV)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        env[key] = make_url(ORIG_ENV[key]).set(database=SCRATCH_DB).render_as_string(hide_password=False)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_cors_", delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                             "--port", str(port), "--log-level", "warning"], cwd=SERVER_DIR, env=env,
                            stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline = time.time() + 40
        while time.time() < deadline:
            if proc.poll() is not None:
                check(False, f"E0 server started (exited {proc.returncode})")
                return 1
            try:
                if httpx.get(f"{base}/health", timeout=2).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        run_cells(base)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
    print(f"\n{len(passes)} OK, {len(failures)} RED")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = 1
    try:
        rc = main()
    finally:
        print(f"PROVE_CORS_EXIT={rc}")
    sys.exit(rc)

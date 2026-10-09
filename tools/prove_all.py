#!/usr/bin/env python
"""prove_all -- run EVERY proof in this repository N times (default 2), serially,
and say what is green, what is red, what could not run, and which greens rest on
an exit code alone.

    python tools\\prove_all.py                       (repo root; or `npm run prove:all` from mobile/)
    python tools\\prove_all.py --runs 3 --only prove_bills,prove:login
    python tools\\prove_all.py --pre0018 E:\\recycle-online-backups\\<a 0017 backup dir>

WHY THIS EXISTS. Commit 1887054's record listed prove_user_create under "Every other
server proof GREEN TWICE:" while that file had been dying at its first gate since
0019 dropped users.role. Nobody noticed for two commits, because the sweep was
hand-run and the report was written from memory of it. This is the instrument that
would have caught it: one command, every proof, each child's OWN exit code read in
the same invocation that started it, and a summary that names every non-green by
name.

WHAT IT STANDS UP, AND WHAT IT REFUSES WITHOUT
----------------------------------------------
The suite needs three servers and eight scratch databases. This script STANDS
THEM UP itself, by construction, so the binding of every server is known rather
than trusted: it takes a fresh dump of the live database (a READ; scripts/
backup_db.py), restores it into the scratches (scripts/restore_db.py), seeds one
fixture shop code per scratch (K7M2P9QB, which prove:loginscreen hardcodes, on the
mobile scratch; SCRBVKQ7 on the clock/year scratch; the live database keeps its
own), and launches three uvicorn children bound by ENVIRONMENT DICT (never a
command line: every shell command on this box lands in .claude/hooks/*.log and
these URLs carry passwords):

  * DEV        -- the database server/.env names, for the ten dev-targeting
                  proofs (they have always written their permanent debris there);
  * SCRATCH    -- recycle_all_scratch_bound, CLOCK_GUARD_TICK_SECONDS=2, for
                  prove_clock_guard and prove_year_gate (both take --database and
                  an API_BASE_URL bound to the SAME copy);
  * MOBILE     -- recycle_all_mobile_scratch, for the five live-server mobile
                  proofs (forbidden, products, users, login, loginscreen).

Each server is DISCRIMINATED THREE WAYS before any proof runs: it must resolve
its own database's fixture code (200) and refuse the other two (404). A dev<->
scratch swap of bindings therefore cannot pass -- which matters most for the two
clock proofs, whose --database names a scratch while their bills go through
whatever API_BASE_URL is bound to.

It REFUSES LOUDLY -- exit 2, no proof run, the reason printed -- when: --runs is
below 1 or --only names nothing; docker `recycle_pg` is not `(healthy)`;
server/.env lacks the three URLs or JWT_SECRET; `uv`, `node` or `npm` is not on
PATH; the pre-0018 (alembic 0017) backup that prove_branches --from needs is
absent; a NATIVE PACKAGE THE SDK BUNDLES is installed at two versions, or at a major
the SDK's own bundledNativeModules.json does not expect (the owner's 2026-09-06
decision: the version gate in every run, the emulator build before a release --
see native_versions_gate); the node program does not COMPILE (`npm run build` in mobile/, run once,
its first `error TS` line quoted -- otherwise fifty proofs would each report exit
2 and the compile error would appear nowhere); the live dump or a restore fails; a
server does not come up or fails its discrimination. A refusal after the dump step
means the eight scratches have already been re-restored: "no proof ran" is a
statement about proofs, not about the scratches. A skip is never a pass.

THE FOUR CLASSES IN THE SUMMARY
-------------------------------
  GREEN               every run exit 0 AND the log carries the proof's own
                      `<NAME>_EXIT=0` line, its VALUE read, not only its presence.
  GREEN, EXIT-CODE-ONLY  every run exit 0 but NO self-printed exit line: the
                      process ended and node/python defaulted to 0 (or set it
                      late). Listed BY NAME so the reader knows which greens are
                      backed by a printed verdict and which by an exit status
                      alone (lessons/a-default-exit-code-is-a-default-verdict.md).
                      Measured 2026-09-06: fourteen proofs were in this class.
  RED                 any run exit 1 (or any integer other than 0/2), OR a run
                      that exited 0 while its own printed verdict line read
                      non-zero -- the proof found a defect, crashed, or its exit
                      status contradicts its verdict. The failure line quoted is
                      the first `[FAIL]`-style cell, else the compiler's first
                      `error TS` line, else the LAST exception line of a
                      traceback; never a passing cell that happens to carry the
                      word REFUSED or FAILED.
  COULD NOT RUN       exit 2 on a run (the proofs' own "refused / incomplete /
                      could-not-run" code, e.g. `--offline`), a TIMEOUT, or a
                      command that could not start. Never counted as a pass. On
                      a timeout the WHOLE process tree is killed (taskkill /T on
                      Windows), so a hung node or python grandchild cannot keep
                      writing into the log or the databases after it was judged.

EXIT CODE: 0 only when RED and COULD NOT RUN are both empty. 1 otherwise. 2 when
the preflight or the stand-up refused and no proof ran. The last line is
`PROVE_ALL_EXIT=<n>`; its ABSENCE means this script itself died, and is a failure.

LOG NAMES CARRY NO COLON. `prove:login` becomes `prove_login.run1.log`: on NTFS a
colon in a file name is an alternate-data-stream separator and the write succeeds
INTO A STREAM of a file named `prove` (CLAUDE.md, Machine footguns).

WHAT THIS DOES NOT DO. It does not fix, skip or retry a proof; it does not judge a
cell (each proof's exit is its own verdict); it does not run the typechecks or the
doc checkers; it does not touch the live database except to dump it and to let
the dev-targeting proofs do what they have always done. It cannot see a native
dependency conflict: a green suite is not evidence the app STARTS
(OPEN_ITEMS.md, Verification gaps, the entry on the headless suite).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SERVER = REPO / "server"
MOBILE = REPO / "mobile"
CONTAINER = os.environ.get("PROVE_PG_CONTAINER", "recycle_pg")
TENANT_A_ID = "11111111-1111-1111-1111-111111111111"   # server/app/seeddata.py
LOGINSCREEN_CODE = "K7M2P9QB"                           # mobile/src/proof/proveLoginScreen.ts GOOD_CODE
SCRATCH_BOUND_CODE = "SCRBVKQ7"                         # letters/digits all present in codes the directory already holds

SCRATCH_BOUND_DB = "recycle_all_scratch_bound"
MOBILE_DB = "recycle_all_mobile_scratch"
# Scratches the --database proofs take by name. Restored from the fresh dump at
# the start of every prove_all run, so each proof meets a copy at head.
FLAGGED_SCRATCHES = {
    "prove_seller_create": ["--database", "recycle_p18a_scratch"],
    "prove_seller_code_reservations": ["--database", "recycle_p18b_scratch"],
    "prove_user_create": ["--database", "recycle_users_scratch"],
    "prove_docno_clock": ["--database", "recycle_docno_scratch"],
    "prove_shop_code": ["--app-database", "recycle_restore_scratch",
                        "--directory-database", "recycle_keyshape_scratch"],
    "prove_clock_guard": ["--database", SCRATCH_BOUND_DB],
    "prove_year_gate": ["--database", SCRATCH_BOUND_DB],
}
RESTORE_TARGETS = ["recycle_p18a_scratch", "recycle_p18b_scratch", "recycle_users_scratch",
                   "recycle_docno_scratch", "recycle_restore_scratch", "recycle_keyshape_scratch",
                   SCRATCH_BOUND_DB, MOBILE_DB]
DEV_TARGETING = {"prove_audit", "prove_auth", "prove_bills", "prove_daily_report", "prove_master",
                 "prove_master_data_gate", "prove_master_write", "prove_revocation",
                 "prove_seller_pricing", "prove_shop_time"}
SCRATCH_SERVER = {"prove_clock_guard", "prove_year_gate"}
MOBILE_LIVE = {"prove:forbidden", "prove:products", "prove:users", "prove:login", "prove:loginscreen", "prove:counter"}
DEFAULT_PRE0018 = REPO.parent / "recycle-online-backups" / "recycle_pre0018_clean_20260904T150246Z_pre-0018-clean"

EXIT_LINE = re.compile(rb"^([A-Z][A-Z0-9_]*EXIT)=(\d+)\s*$", re.M)
CELL_FAIL = re.compile(rb"^\s*\[(?:FAIL|fail|RED|red)\b.*$", re.M)
TS_ERROR = re.compile(rb"^.*\berror TS\d+:.*$", re.M)
EXCEPTION_LINE = re.compile(rb"^(?:[A-Za-z_][\w.]*\.)?[A-Z]\w*(?:Error|Exception)\b.*$", re.M)
CLAIMS_LINE = re.compile(rb"^\s*THESE CLAIMS DID NOT HOLD.*$", re.M)


def say(msg: str) -> None:
    """THE RUNNER MUST NEVER RAISE WHILE REPORTING. Every line it prints goes through
    here, and a RED note quotes a child's failing line verbatim -- Thai, `·`, anything.
    With stdout redirected to a file, Python on this box encodes it as CP874, which has
    no `·`: on 2026-10-09 `print` raised UnicodeEncodeError on prove:counter's red line
    and the run lost its TOTAL line and PROVE_ALL_EXIT. So the message is encoded for
    the stream's OWN encoding with backslashreplace (`·` -> `\\xb7`; Thai survives in
    CP874 and UTF-8 alike) -- in the code, never in a variable a launch must remember.
    The child logs, summary.md and results.json are UTF-8 bytes and lose nothing."""
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(msg.encode(enc, errors="backslashreplace").decode(enc), flush=True)


class Refused(Exception):
    """Preflight or stand-up refusal: printed, exit 2, no proof runs."""


# ---------------------------------------------------------------------------
# environment
# ---------------------------------------------------------------------------
def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def swap_db(url: str, db: str) -> str:
    head, _, _ = url.rpartition("/")
    return f"{head}/{db}"


def db_name(url: str) -> str:
    return url.rpartition("/")[2].split("?")[0]


def free_port() -> int:
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http_status(url: str, method: str = "GET", body: bytes | None = None, timeout: float = 3.0) -> int:
    req = urllib.request.Request(url, data=body, method=method,
                                 headers={"content-type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def psql(db: str, sql: str) -> str:
    """One statement as the cluster superuser; returns the FIRST line of -At output
    (a RETURNING row, or a SELECT value). psql -At prints a command tag after a
    RETURNING row, so the first line is the data."""
    cp = subprocess.run(["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-At", "-d", db, "-c", sql],
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        raise Refused(f"psql on {db} failed ({cp.returncode}): {cp.stderr.strip()}")
    out = cp.stdout.strip()
    return out.splitlines()[0].strip() if out else ""


def kill_tree(proc: subprocess.Popen) -> None:
    """Kill the child AND everything it spawned. subprocess's own kill() reaches only
    the direct child (uv.exe / npm.cmd); the python or node grandchild would survive
    and keep writing to the log and the databases after being judged."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()
    try:
        proc.wait(15)
    except subprocess.TimeoutExpired:
        pass


# ---------------------------------------------------------------------------
# the native-version gate (the owner's decision, 2026-09-06: the cheap check, every run)
# ---------------------------------------------------------------------------
NATIVE_PREFIXES = ("expo-", "@expo/")


def _walk_node_modules(root: Path, found: dict[str, dict[str, list[str]]], depth: int = 0) -> None:
    """Every package.json under node_modules, nested copies included: name -> version -> paths."""
    if depth > 6 or not root.is_dir():
        return
    for entry in root.iterdir():
        if entry.name.startswith(".") or not entry.is_dir():
            continue
        pkgs = [entry] if not entry.name.startswith("@") else [p for p in entry.iterdir() if p.is_dir()]
        for pkg in pkgs:
            pj = pkg / "package.json"
            if pj.is_file():
                try:
                    meta = json.loads(pj.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                name, version = meta.get("name"), meta.get("version")
                if isinstance(name, str) and isinstance(version, str) and \
                        (name.startswith(NATIVE_PREFIXES) or name == "expo"):
                    found.setdefault(name, {}).setdefault(version, []).append(str(pkg.relative_to(MOBILE)))
            nested = pkg / "node_modules"
            if nested.is_dir():
                _walk_node_modules(nested, found, depth + 1)


def _major(version_or_range: str) -> int | None:
    m = re.search(r"(\d+)", version_or_range)
    return int(m.group(1)) if m else None


def native_versions_gate() -> None:
    """REFUSE when the installed Expo native packages cannot be the ones the SDK expects.

    WHY THIS SHAPE AND NOT `expo install --check` ALONE. The 2026-09-06 regression was
    `@expo/vector-icons` hoisting `expo-font@57.0.2` above the `14.0.12` that `expo`
    kept nested: two versions of one native package, the autolinker compiling the
    hoisted one, the app dead at startup. `npx expo install --check` looks only at
    the packages DECLARED in package.json -- expo-font was not declared then, so it
    said nothing about it -- and it exits 1 today for a patch-level drift of `expo`
    itself (54.0.36 vs ~54.0.37), which is not a native conflict and which this tree
    runs fine under. So the gate is built from what the SDK itself ships:

      A. ONE VERSION PER NATIVE PACKAGE anywhere under node_modules (hoisted and
         nested alike). Two versions is the regression's exact shape.
      B. THE TOP-LEVEL MAJOR MUST MATCH `node_modules/expo/bundledNativeModules.json`,
         the SDK's own table of expected versions (119 entries for SDK 54), for
         every expo-*/@expo/* package that table names. 57 against ~14 refuses;
         14.0.12 against ~14.0.12 passes; a patch behind passes.

    `npx expo install --check` is then RUN and its verdict PRINTED as information --
    a patch-level drift is worth the reader's eye, not a refusal.

    WHAT THIS DOES NOT COVER, so nobody reads it as complete: a native module that is
    correctly versioned and still fails to link or crashes at startup, an ABI or NDK
    mismatch, a config plugin that changed the native project. Only a build that
    installs and launches sees those, and the owner placed that before a release,
    not in every suite run (OPEN_ITEMS.md, Verification gaps).
    """
    # SCOPE: the packages the SDK's own table names. `@expo/*` also holds pure-JS tooling
    # (`@expo/json-file`, `@expo/config-plugins`, `@expo/package-manager`) that legitimately
    # sits at several nested versions -- measured 2026-09-06: `@expo/json-file` at 10.0.16,
    # 10.2.0 and 11.0.1 on a tree that builds and runs. Those never reach the autolinker.
    table_path = MOBILE / "node_modules" / "expo" / "bundledNativeModules.json"
    if not table_path.is_file():
        raise Refused(f"native-version gate needs {table_path} (the SDK's own expected-version table) and it is absent")
    table = json.loads(table_path.read_text(encoding="utf-8"))
    walked: dict[str, dict[str, list[str]]] = {}
    _walk_node_modules(MOBILE / "node_modules", walked)
    found = {n: v for n, v in walked.items() if isinstance(table.get(n), str)}
    if not found:
        raise Refused("native-version gate found none of the SDK's native packages under mobile/node_modules -- is the tree installed?")
    duplicates = {n: v for n, v in found.items() if len(v) > 1}
    if duplicates:
        lines = [f"{n}: " + "; ".join(f"{ver} at {', '.join(paths)}" for ver, paths in sorted(v.items()))
                 for n, v in sorted(duplicates.items())]
        raise Refused("native-version gate A: a native package is installed at MORE THAN ONE version, and the "
                      "autolinker compiles whichever is hoisted -- " + " | ".join(lines))
    mismatched = []
    for name, versions in sorted(found.items()):
        (installed,) = versions.keys()
        if _major(installed) != _major(table[name]):
            mismatched.append(f"{name}: installed {installed}, the SDK expects {table[name]}")
    if mismatched:
        raise Refused("native-version gate B: an installed native package is a different MAJOR from what "
                      "bundledNativeModules.json expects -- " + " | ".join(mismatched))
    say(f"  native versions: {len(found)} of the SDK's {len(table)} bundled native packages installed, one version "
        f"each, every major matching bundledNativeModules.json ({len(walked) - len(found)} other expo/@expo "
        f"tooling packages not judged)")
    cp = subprocess.run(["npx.cmd" if os.name == "nt" else "npx", "expo", "install", "--check"], cwd=str(MOBILE),
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    report = [l.strip() for l in (cp.stdout + cp.stderr).splitlines() if " - expected version:" in l]
    say(f"  `npx expo install --check` exit {cp.returncode} (information, not a gate): "
        + ("; ".join(report) if report else "nothing outdated"))


# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------
def preflight(args) -> dict[str, str]:
    say("=== preflight (every line below must hold, or this run REFUSES) ===")
    if args.runs < 1:
        raise Refused(f"--runs must be at least 1 (got {args.runs}); zero runs would classify every proof green on nothing")
    for tool in ("docker", "uv", "node", "npm"):
        if shutil.which(tool) is None and shutil.which(tool + ".cmd") is None:
            raise Refused(f"`{tool}` is not on PATH")
    cp = subprocess.run(["docker", "ps", "--filter", f"name={CONTAINER}", "--format", "{{.Names}} {{.Status}}"],
                        capture_output=True, text=True)
    status_line = next((l for l in cp.stdout.splitlines() if l.split(" ", 1)[0] == CONTAINER), "")
    if cp.returncode != 0 or not status_line or not re.search(r"\(healthy\)", status_line):
        raise Refused(f"docker container {CONTAINER!r} is not up and (healthy): {status_line or cp.stderr.strip()!r}")
    say(f"  docker: {status_line}")
    env_path = SERVER / ".env"
    if not env_path.exists():
        raise Refused(f"{env_path} is missing")
    dotenv = load_env(env_path)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL", "JWT_SECRET"):
        if not dotenv.get(key):
            raise Refused(f"server/.env has no {key} (no default by design)")
    say(f"  server/.env: live database = {db_name(dotenv['APP_DATABASE_URL'])!r}, JWT_SECRET set")
    if not (args.pre0018 / "MANIFEST.json").exists():
        raise Refused(f"prove_branches needs a 0017 (pre-0018) backup dir; not found: {args.pre0018}")
    say(f"  pre-0018 backup for prove_branches: {args.pre0018}")
    if not (MOBILE / "node_modules").exists():
        raise Refused("mobile/node_modules is absent -- run `npm install` in mobile/ first")
    native_versions_gate()
    # The node program must compile ONCE here: every prove:* script begins with
    # `npm run build`, so a single type error would otherwise surface as fifty
    # exit-2 "could not run" rows with the compiler's message quoted nowhere.
    cp = subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build"], cwd=str(MOBILE),
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        first = next((l for l in (cp.stdout + cp.stderr).splitlines() if "error TS" in l), None)
        raise Refused(f"the node program does not compile (`npm run build` in mobile/ exit {cp.returncode}): "
                      f"{first or '(no `error TS` line; read the build output)'}")
    say("  mobile: `npm run build` exit 0 (the node program compiles)")
    return dotenv


# ---------------------------------------------------------------------------
# proofs
# ---------------------------------------------------------------------------
def enumerate_proofs() -> list[dict]:
    plan: list[dict] = []
    for f in sorted((SERVER / "scripts").glob("prove_*.py")):
        plan.append({"name": f.stem, "cwd": str(SERVER),
                     "argv": ["uv", "run", "python", f"scripts/{f.name}", *FLAGGED_SCRATCHES.get(f.stem, [])]})
    pkg = json.loads((MOBILE / "package.json").read_text(encoding="utf-8"))
    for key in pkg["scripts"]:
        if key.startswith("prove:") and key != "prove:all":
            plan.append({"name": key, "cwd": str(MOBILE), "argv": ["npm.cmd" if os.name == "nt" else "npm", "run", key]})
    return plan


def log_name(name: str) -> str:
    return name.replace(":", "_")


def first_failure(raw: bytes) -> str | None:
    """The line a reader should see for a red: a failed cell, else the compiler's
    error, else the LAST exception line (the one actually raised), else the
    proofs' own 'THESE CLAIMS DID NOT HOLD' header. Never a bare-word match on
    REFUSED/FAILED, which passing cells carry too."""
    m = CELL_FAIL.search(raw)
    if m:
        return m.group(0).decode("utf-8", "replace").strip()[:300]
    m = TS_ERROR.search(raw)
    if m:
        return m.group(0).decode("utf-8", "replace").strip()[:300]
    excs = [m.group(0) for m in EXCEPTION_LINE.finditer(raw)]
    if excs:
        return excs[-1].decode("utf-8", "replace").strip()[:300]
    m = CLAIMS_LINE.search(raw)
    if m:
        return m.group(0).decode("utf-8", "replace").strip()[:300]
    return None


def scan(raw: bytes) -> dict:
    exit_lines = EXIT_LINE.findall(raw)
    return {
        "exit_line": (exit_lines[-1][0] + b"=" + exit_lines[-1][1]).decode("utf-8", "replace") if exit_lines else None,
        "exit_value": int(exit_lines[-1][1]) if exit_lines else None,
        "first_bad": first_failure(raw),
    }


def run_proof(entry: dict, run_no: int, out: Path, env_extra: dict[str, str], timeout: int) -> dict:
    log_path = out / f"{log_name(entry['name'])}.run{run_no}.log"
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env.update(env_extra)
    t0 = time.time()
    code: int | str
    with log_path.open("wb") as fh:
        try:
            proc = subprocess.Popen(entry["argv"], cwd=entry["cwd"], env=env, stdout=fh, stderr=subprocess.STDOUT)
        except FileNotFoundError as exc:
            fh.write(f"COULD NOT RUN: {exc}\n".encode("utf-8"))
            code = "COULD_NOT_START"
        else:
            try:
                code = proc.wait(timeout)
            except subprocess.TimeoutExpired:
                kill_tree(proc)
                fh.write(f"\nCOULD NOT RUN: timed out after {timeout}s; the process tree was killed\n".encode("utf-8"))
                code = "TIMEOUT"
    return {"run": run_no, "exit": code, "seconds": round(time.time() - t0, 1), "log": log_path.name,
            **scan(log_path.read_bytes())}


# ---------------------------------------------------------------------------
# servers and scratches
# ---------------------------------------------------------------------------
class Server:
    def __init__(self, label: str, db: str, dotenv: dict[str, str], out: Path, tick: str | None = None):
        self.label, self.db, self.port = label, db, free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = dict(os.environ)
        for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
            env[key] = swap_db(dotenv[key], db)
        for key in ("JWT_SECRET", "JWT_TTL_SECONDS", "PROVISION_ADMIN_PASSWORD"):
            if key in dotenv:
                env[key] = dotenv[key]
        if tick is not None:
            env["CLOCK_GUARD_TICK_SECONDS"] = tick
        env["PYTHONUTF8"] = "1"
        venv_python = SERVER / ".venv" / "Scripts" / "python.exe"
        cmd = ([str(venv_python), "-m", "uvicorn"] if venv_python.exists() else ["uv", "run", "uvicorn"]) + \
              ["app.main:app", "--host", "127.0.0.1", "--port", str(self.port)]
        self.log = (out / f"server_{label}.log").open("wb")
        self.proc = subprocess.Popen(cmd, cwd=str(SERVER), env=env, stdout=self.log, stderr=subprocess.STDOUT)

    def wait_healthy(self, seconds: int = 90) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise Refused(f"server {self.label} (db {self.db}) exited {self.proc.returncode} before /health -- see server_{self.label}.log")
            if http_status(f"{self.base}/health") == 200:
                return
            time.sleep(0.5)
        raise Refused(f"server {self.label} (db {self.db}) did not answer /health within {seconds}s")

    def stop(self) -> None:
        if self.proc.poll() is None:
            kill_tree(self.proc)
        self.log.close()


def fresh_dump(out: Path) -> Path:
    say("=== a fresh dump of the live database (a READ; scripts/backup_db.py) ===")
    with (out / "backup_db.log").open("wb") as fh:
        cp = subprocess.run(["uv", "run", "python", "scripts/backup_db.py", "--label", "prove-all"],
                            cwd=str(SERVER), stdout=fh, stderr=subprocess.STDOUT,
                            env={**os.environ, "PYTHONUTF8": "1"})
    text = (out / "backup_db.log").read_text(encoding="utf-8", errors="replace")
    m = re.search(r"^BACKUP OK: (.+)$", text, re.M)
    if cp.returncode != 0 or not m:
        raise Refused(f"backup_db.py exit {cp.returncode}, no `BACKUP OK:` line -- see backup_db.log")
    dump = Path(m.group(1).strip())
    say(f"  dump: {dump}")
    return dump


def restore(dump: Path, db: str, out: Path) -> None:
    with (out / f"restore_{db}.log").open("wb") as fh:
        cp = subprocess.run(["uv", "run", "python", "scripts/restore_db.py", str(dump), "--into", db],
                            cwd=str(SERVER), stdout=fh, stderr=subprocess.STDOUT,
                            env={**os.environ, "PYTHONUTF8": "1"})
    if cp.returncode != 0:
        raise Refused(f"restore_db.py into {db} exit {cp.returncode} -- see restore_{db}.log")
    say(f"  restored {db}")


def seed_code(db: str, code: str) -> None:
    got = psql(db, f"UPDATE directory.shop_codes SET code='{code}' WHERE tenant_id='{TENANT_A_ID}' RETURNING code")
    if got != code:
        raise Refused(f"could not seed shop code {code} for tenant A on {db}: got {got!r}")
    say(f"  seeded shop code {code} for tenant A on {db}")


def discriminate(servers: dict[str, Server], codes: dict[str, str]) -> None:
    """Every server must resolve ITS database's code and refuse the other two."""
    for label, srv in servers.items():
        for owner, code in codes.items():
            want = 200 if owner == label else 404
            status = http_status(f"{srv.base}/auth/shop-code", "POST", json.dumps({"code": code}).encode())
            mark = "ok" if status == want else "WRONG"
            say(f"  {label:7} port {srv.port} db {srv.db}: code {code} ({owner}) -> {status} want {want} {mark}")
            if status != want:
                raise Refused(f"server {label} answered {status} for {owner}'s fixture code {code}; expected {want}. "
                              "This server is not bound to the database it should be.")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def classify(runs: list[dict]) -> tuple[str, str]:
    """-> (class, note). Integer exits other than 0/2 are RED; a run that exited 0
    while its own printed verdict read non-zero is RED; exit 2, TIMEOUT and
    COULD_NOT_START are COULD NOT RUN; the rest is GREEN, with or without a
    self-printed exit line of value 0."""
    exits = [r["exit"] for r in runs]
    red_ints = [x for x in exits if isinstance(x, int) and x not in (0, 2)]
    verdict_red = [r for r in runs if r["exit"] == 0 and r["exit_value"] not in (None, 0)]
    if red_ints or verdict_red:
        first = next(r for r in runs if (isinstance(r["exit"], int) and r["exit"] not in (0, 2)) or r in verdict_red)
        why = first["first_bad"] or f"exit {first['exit']}, log {first['log']}"
        if first in verdict_red:
            why = f"printed verdict {first['exit_line']} under process exit 0 -- {why}"
        return "RED", f"exits={exits}  {why}"
    if any(isinstance(x, str) or x == 2 for x in exits):
        first = next(r for r in runs if isinstance(r["exit"], str) or r["exit"] == 2)
        why = first["first_bad"] or f"exit {first['exit']} (refused / incomplete / never finished), log {first['log']}"
        return "COULD_NOT_RUN", f"exits={exits}  {why}"
    if all(r["exit_value"] == 0 for r in runs):
        return "GREEN", ""
    return "GREEN_EXIT_ONLY", ""


def main() -> int:
    ap = argparse.ArgumentParser(description="Run every proof N times and summarise.")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--only", default="", help="comma-separated proof names")
    ap.add_argument("--timeout", type=int, default=1800, help="seconds per proof run")
    ap.add_argument("--pre0018", type=Path, default=DEFAULT_PRE0018, help="a backup_db.py dir at alembic 0017, for prove_branches --from")
    ap.add_argument("--out", type=Path, default=REPO.parent / "recycle-online-backups" / "_prove_all")
    args = ap.parse_args()

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = args.out / stamp
    out.mkdir(parents=True, exist_ok=True)
    say(f"prove_all  runs={args.runs}  logs={out}")

    dotenv = preflight(args)
    only = {s for s in args.only.split(",") if s}
    plan = [e for e in enumerate_proofs() if not only or e["name"] in only]
    if only and len(plan) != len(only):
        raise Refused(f"--only names unknown proofs: {sorted(only - {e['name'] for e in plan})}")
    if not plan:
        raise Refused("no proofs selected")
    say(f"  proofs: {len(plan)} ({sum(e['cwd'] == str(SERVER) for e in plan)} server, {sum(e['cwd'] == str(MOBILE) for e in plan)} mobile)")

    live_db = db_name(dotenv["APP_DATABASE_URL"])
    dev_code = psql(live_db, f"SELECT code FROM directory.shop_codes WHERE tenant_id='{TENANT_A_ID}'")
    if not dev_code:
        raise Refused(f"the live database {live_db!r} holds no shop code for tenant A; the servers cannot be discriminated")

    dump = fresh_dump(out)
    say("=== scratches (restored from that dump) ===")
    for db in RESTORE_TARGETS:
        restore(dump, db, out)
    seed_code(MOBILE_DB, LOGINSCREEN_CODE)
    seed_code(SCRATCH_BOUND_DB, SCRATCH_BOUND_CODE)
    for e in plan:
        if e["name"] == "prove_branches":
            e["argv"] += ["--from", str(args.pre0018), "--database", "recycle_branches_scratch"]
        if e["name"] == "prove_reconcile":
            e["argv"] += ["--database", "recycle_recon_scratch", "--from", str(dump)]

    say("=== servers (bound by environment dict; ports chosen free) ===")
    servers: dict[str, Server] = {}
    results: dict[str, dict] = {}
    t_start = time.time()
    try:
        servers["dev"] = Server("dev", live_db, dotenv, out)
        servers["scratch"] = Server("scratch", SCRATCH_BOUND_DB, dotenv, out, tick="2")
        servers["mobile"] = Server("mobile", MOBILE_DB, dotenv, out)
        for s in servers.values():
            s.wait_healthy()
        discriminate(servers, {"dev": dev_code, "scratch": SCRATCH_BOUND_CODE, "mobile": LOGINSCREEN_CODE})

        say(f"=== running {len(plan)} proofs x {args.runs} ===")
        for i, e in enumerate(plan, 1):
            env_extra: dict[str, str] = {}
            if e["name"] in DEV_TARGETING:
                env_extra["API_BASE_URL"] = servers["dev"].base
            if e["name"] in SCRATCH_SERVER:
                env_extra["API_BASE_URL"] = servers["scratch"].base
            if e["name"] in MOBILE_LIVE:
                env_extra["RECYCLE_API_BASE"] = servers["mobile"].base
            runs = [run_proof(e, n, out, env_extra, args.timeout) for n in range(1, args.runs + 1)]
            for r in runs:
                say(f"[{i}/{len(plan)}] {e['name']} run{r['run']} exit={r['exit']} exit_line={r['exit_line']} {r['seconds']}s")
            results[e["name"]] = {"argv": e["argv"], "env": env_extra, "runs": runs}
            (out / "results.json").write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    finally:
        for s in servers.values():
            s.stop()
    return report(out, stamp, args.runs, round(time.time() - t_start), results)


def report(out: Path, stamp: str, runs_per_proof: int, seconds: int, results: dict) -> int:
    """Classify every proof, write summary.md (UTF-8) and print the summary. Its own
    function so the reporting path can be driven with synthetic results
    (the 2026-10-09 encoding repair's proof does exactly that)."""
    # ---- classify -----------------------------------------------------------
    green, green_exit_only, red, cnr = [], [], [], []
    for name, r in results.items():
        klass, note = classify(r["runs"])
        {"GREEN": green, "GREEN_EXIT_ONLY": green_exit_only}.get(klass, None) is not None and \
            {"GREEN": green, "GREEN_EXIT_ONLY": green_exit_only}[klass].append(name)
        if klass == "RED":
            red.append((name, note))
        elif klass == "COULD_NOT_RUN":
            cnr.append((name, note))

    lines = [f"# prove_all  {stamp}  runs={runs_per_proof}  {seconds}s", "",
             f"TOTAL {len(results)}  GREEN {len(green)}  GREEN-EXIT-CODE-ONLY {len(green_exit_only)}  RED {len(red)}  COULD-NOT-RUN {len(cnr)}", ""]
    lines.append("## RED (a defect, a crash, or a printed verdict contradicting exit 0) -- " + (", ".join(n for n, _ in red) or "none"))
    lines += [f"  - {n}  {note}" for n, note in red]
    lines.append("## COULD NOT RUN (exit 2 / timeout / could not start; never a pass) -- " + (", ".join(n for n, _ in cnr) or "none"))
    lines += [f"  - {n}  {note}" for n, note in cnr]
    lines.append("## GREEN, EXIT-CODE-ONLY (no self-printed exit line; the status alone says 0) -- " + (", ".join(green_exit_only) or "none"))
    lines.append("## GREEN (exit 0 every run, and the proof's own exit line reads 0) -- " + (", ".join(green) or "none"))
    summary = "\n".join(lines)
    (out / "summary.md").write_text(summary + "\n", encoding="utf-8")
    say("")
    say(summary)
    say(f"logs: {out}")
    return 1 if (red or cnr) else 0


if __name__ == "__main__":
    try:
        rc = main()
    except Refused as exc:
        say(f"REFUSED: {exc}")
        rc = 2
    say(f"PROVE_ALL_EXIT={rc}")
    sys.exit(rc)

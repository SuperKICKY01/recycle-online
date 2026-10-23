/**
 * H2 (ADVISOR-DECIDED 2026-10-23), THE PHONE'S HALF OF MONEY UNDER FAULTS — run by
 * `npm run prove:syncfaults`.
 *
 * WHAT THIS DRIVES: the production SyncEngine, SqliteLocalStore (a real file) and HttpTransport
 * against the REAL server at RECYCLE_API_BASE, each device in its OWN OS process
 * (syncFaultsChild.ts) so it can really be killed. Bills are the app's own shape (buildLocalBill);
 * every server answer is read back over HTTP by id.
 *
 * WHAT EXISTED BEFORE (measured 2026-10-23): proveSync CASE 3 (lost ack) and CASE 4 (a bill
 * stranded `syncing`, restart) and sqliteProof S3 (concurrent claimers on one file) and S4 (close
 * and reopen, then recovery) -- all against FAKE servers, CASE 4's "crash" a forced state rather
 * than a killed process. This file adds the same invariants with a real kill and a real server:
 *
 *   K1  KILLED IN THE ACK WINDOW: the child SIGKILLs itself the instant the server has answered the
 *       third bill and before the device records it. Read after: the server holds bills 1-3, the
 *       device holds 1-2 synced, 3 `syncing`, 4-6 pending. A NEW process boots the app's way
 *       (recoverInterrupted, then sync): bill 3 is re-sent under its key and answered DUPLICATE,
 *       4-6 accepted -- all six synced with the server's own doc_no, each once, each paid exactly.
 *   K2  KILLED AT AN ARBITRARY MOMENT: ten bills, every send slowed, the process killed by the
 *       parent (TerminateProcess) once the server holds four. The device never holds a bill as
 *       synced that the server lacks, and at most one bill is in flight; a new process then
 *       drains all ten, each once, doc_no equal, paid exactly.
 *   D   TWO DEVICES, OVERLAPPING OUTBOXES, CONCURRENTLY: device A holds 6 bills of its own and 5
 *       shared, device B 6 of its own and the SAME 5 (same ids, same keys, same bodies -- a phone's
 *       database copied to a second phone). Both processes start on one line. All 17 reach the
 *       server once; each shared bill was CREATED by exactly one device (one `accepted` across
 *       both) and answered `duplicate` to the other; both devices hold the server's doc_no for it.
 *
 * "Each once, paid exactly": GET /bills/{id} answers 200 with the local idempotency key, the
 * local doc_no, and paid_amount == total_amount (one automatic payment; a second would be refused
 * by the server's own key, so this reads the ledger, not a hope).
 *
 * REFUSES (exit 2) without RECYCLE_API_BASE: a default of :8000 could be the dev database.
 * tools/prove_all.py hands it the mobile scratch's server (MOBILE_LIVE).
 *
 * THE DISPROOF, RUN BY HAND (2026-10-23): src/sync/outboxHandlers.ts bill_send `recover` no longer
 * calls resetSyncingToPending -> K1 goes red (bill 3 stays `syncing` for ever, never re-sent).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { withClientVersion } from "../net/clientVersion.js";
import { buildLocalBill } from "../sync/createBill.js";
import { systemClock } from "../sync/systemClock.js";
import type { LocalBill } from "../sync/types.js";
import { PROOF_OWNER } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

const API = process.env.RECYCLE_API_BASE ?? "";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SELLER_A = "aaaa0000-0000-0000-0000-0000000000a4";
const PRODUCT_A = "aaaa0000-0000-0000-0000-0000000000a3";
const CHILD = fileURLToPath(new URL("./syncFaultsChild.js", import.meta.url));
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: TENANT_A, username: "admin", password: "tenantA-pw-123" }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

function newBill(net: string): LocalBill {
  return buildLocalBill(
    { clock: systemClock, ids: { newId: () => randomUUID() } },
    {
      seller: { kind: "server", seller_id: SELLER_A },
      vehicle_no: "70-fault",
      items: [{
        id: randomUUID(), product_id: PRODUCT_A, line_no: 1,
        gross_weight: net, tare_weight: "0.000", net_weight: net, unit_price: "20.00", list_price: "20.00",
      }],
      total_amount: null,
      master_as_of: null,
    },
  );
}

/** Bills built one after another, so device_created_at -- the send order -- is creation order. */
async function bills(n: number, tag: number): Promise<LocalBill[]> {
  const out: LocalBill[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(newBill(`${String(tag)}.${String(100 + i)}`));
    await sleep(3);
  }
  return out;
}

async function seed(file: string, rows: LocalBill[]): Promise<void> {
  const driver = NodeSqliteDriver.open(file);
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    for (const b of rows) await store.putBill(b, PROOF_OWNER);
  } finally {
    await driver.close();
  }
}

interface LocalState { state: string; doc_no: string | null; key: string }

async function readLocal(file: string, ids: readonly string[]): Promise<Map<string, LocalState>> {
  const driver = NodeSqliteDriver.open(file);
  try {
    const store = await SqliteLocalStore.open(driver);
    const out = new Map<string, LocalState>();
    for (const id of ids) {
      const b = await store.getBill(id);
      out.set(id, { state: b?.sync_state ?? "MISSING", doc_no: b?.doc_no ?? null, key: b?.idempotency_key ?? "" });
    }
    return out;
  } finally {
    await driver.close();
  }
}

interface ServerBill { status: number; doc_no: string | null; key: string | null; total: string | null; paid: string | null }

async function serverBill(token: string, id: string): Promise<ServerBill> {
  const res = await apiFetch(`${API}/bills/${id}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status !== 200) return { status: res.status, doc_no: null, key: null, total: null, paid: null };
  const b = (await res.json()) as { doc_no?: string; idempotency_key?: string; total_amount?: string; paid_amount?: string };
  return { status: 200, doc_no: b.doc_no ?? null, key: b.idempotency_key ?? null, total: b.total_amount ?? null,
    paid: b.paid_amount ?? null };
}

async function onServer(token: string, ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) if ((await serverBill(token, id)).status === 200) n += 1;
  return n;
}

interface ChildRun { code: number | null; signal: string | null; stdout: string; summary: Summary | null; killedByParent: boolean }
interface Summary {
  recovered: string[];
  total: Record<string, number>;
  outcomes: Record<string, string[]>;
  spans: Record<string, [number, number][]>;
}

function runChild(mode: string, file: string, goFile: string, token: string, opts: {
  killAt?: number; killWhen?: () => Promise<boolean>;
} = {}): Promise<ChildRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD, mode, file, goFile], {
      env: { ...process.env, SYNCFAULTS_API: API, SYNCFAULTS_TOKEN: token, SYNCFAULTS_KILL_AT: String(opts.killAt ?? 0) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let killedByParent = false;
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    let watching = opts.killWhen !== undefined;
    if (opts.killWhen) {
      const when = opts.killWhen;
      void (async () => {
        while (watching) {
          if (await when()) {
            killedByParent = true;
            child.kill("SIGKILL");
            return;
          }
          await sleep(50);
        }
      })();
    }
    child.on("close", (code, signal) => {
      watching = false;
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith("SYNCFAULTS_CHILD "));
      resolve({ code, signal: signal ?? null, stdout, killedByParent,
        summary: line ? (JSON.parse(line.slice("SYNCFAULTS_CHILD ".length)) as Summary) : null });
    });
  });
}

/** Every bill synced locally, on the server once under its own key, doc_no equal, paid exactly. */
async function settled(label: string, token: string, file: string, rows: readonly LocalBill[]): Promise<Map<string, string>> {
  const ids = rows.map((b) => b.id);
  const local = await readLocal(file, ids);
  const docs = new Map<string, string>();
  const bad: string[] = [];
  for (const b of rows) {
    const l = local.get(b.id);
    const s = await serverBill(token, b.id);
    if (l?.state !== "synced" || l.doc_no === null) bad.push(`${b.id.slice(0, 8)} local ${String(l?.state)}`);
    else if (s.status !== 200) bad.push(`${b.id.slice(0, 8)} server ${String(s.status)}`);
    else if (s.doc_no !== l.doc_no) bad.push(`${b.id.slice(0, 8)} doc_no local ${l.doc_no} server ${String(s.doc_no)}`);
    else if (s.key !== b.idempotency_key) bad.push(`${b.id.slice(0, 8)} key differs`);
    else if (s.paid !== s.total) bad.push(`${b.id.slice(0, 8)} paid ${String(s.paid)} of ${String(s.total)}`);
    if (l?.doc_no) docs.set(b.id, l.doc_no);
  }
  check(`${label}: all ${String(rows.length)} synced on the device, on the server once under their own key,`
    + " doc_no equal both sides, paid exactly", bad.length === 0, bad.length ? bad.slice(0, 4).join("; ") : "");
  const distinctDocs = new Set(docs.values());
  check(`${label}: ${String(rows.length)} bills hold ${String(distinctDocs.size)} distinct doc_nos`, distinctDocs.size === rows.length);
  return docs;
}

async function k1(token: string, dir: string): Promise<void> {
  header("K1  KILLED IN THE ACK WINDOW: the server committed bill 3, the device never recorded it");
  const file = join(dir, "k1.db");
  const rows = await bills(6, 1);
  await seed(file, rows);
  const run = await runChild("ackkill", file, join(dir, "unused"), token, { killAt: 3 });
  check("K1: the child died by its own kill, before any summary", run.summary === null && run.stdout.includes("killing before it is recorded"),
    `code=${String(run.code)} signal=${String(run.signal)}`);
  const ids = rows.map((b) => b.id);
  const server = await Promise.all(ids.map((id) => serverBill(token, id)));
  const local = await readLocal(file, ids);
  const states = ids.map((id) => local.get(id)?.state ?? "?");
  console.log(`  after the kill: server ${server.map((s) => (s.status === 200 ? "has" : "-")).join(" ")}; device ${states.join(" ")}`);
  check("K1: the server holds bills 1-3 and not 4-6", server.map((s) => s.status).join(",") === "200,200,200,404,404,404");
  check("K1: the device holds 1-2 synced, 3 SYNCING (committed, unrecorded), 4-6 pending",
    states.join(",") === "synced,synced,syncing,pending,pending,pending");
  const go = join(dir, "k1.go");
  writeFileSync(go, "");
  const restart = await runChild("sync", file, go, token);
  const third = ids[2] ?? "";
  check("K1: the restarted process recovered exactly bill 3 at boot",
    JSON.stringify(restart.summary?.recovered ?? []) === JSON.stringify([third]),
    `recovered=${JSON.stringify(restart.summary?.recovered ?? null)}`);
  check("K1: bill 3 was re-sent once under its own key and answered DUPLICATE; 4-6 ACCEPTED",
    JSON.stringify(restart.summary?.outcomes[third] ?? []) === '["duplicate"]'
      && ids.slice(3).every((id) => JSON.stringify(restart.summary?.outcomes[id] ?? []) === '["accepted"]'),
    JSON.stringify(restart.summary?.outcomes ?? {}).slice(0, 300));
  await settled("K1", token, file, rows);
}

async function k2(token: string, dir: string): Promise<void> {
  header("K2  KILLED AT AN ARBITRARY MOMENT mid-batch (TerminateProcess from outside)");
  const file = join(dir, "k2.db");
  const rows = await bills(10, 2);
  await seed(file, rows);
  const ids = rows.map((b) => b.id);
  const run = await runChild("slow", file, join(dir, "unused"), token, { killWhen: async () => (await onServer(token, ids)) >= 4 });
  const atKill = await onServer(token, ids);
  const local = await readLocal(file, ids);
  const synced = ids.filter((id) => local.get(id)?.state === "synced");
  const syncing = ids.filter((id) => local.get(id)?.state === "syncing");
  console.log(`  killed by the parent: ${String(run.killedByParent)}; server holds ${String(atKill)} of 10;`
    + ` device: ${String(synced.length)} synced, ${String(syncing.length)} syncing`);
  check("K2: the parent killed the child mid-batch (no summary written)", run.killedByParent && run.summary === null);
  const serverHas = new Set<string>();
  for (const id of ids) if ((await serverBill(token, id)).status === 200) serverHas.add(id);
  check("K2: the device holds no bill as synced that the server lacks", synced.every((id) => serverHas.has(id)));
  check("K2: at most ONE bill was in flight (on the server, not yet recorded)", serverHas.size - synced.length <= 1 && syncing.length <= 1,
    `server ${String(serverHas.size)} vs synced ${String(synced.length)}, syncing ${String(syncing.length)}`);
  const go = join(dir, "k2.go");
  writeFileSync(go, "");
  await runChild("sync", file, go, token);
  await settled("K2", token, file, rows);
}

async function twoDevices(token: string, dir: string): Promise<void> {
  header("D  TWO DEVICES, OVERLAPPING OUTBOXES, syncing concurrently against one server");
  // The SHARED bills are weighed first, so both devices open on the same bill at the same moment:
  // the head of each queue is the same key, sent twice at once.
  const shared = await bills(5, 3);
  const ownA = await bills(6, 4);
  const ownB = await bills(6, 5);
  const fa = join(dir, "devA.db");
  const fb = join(dir, "devB.db");
  await seed(fa, [...ownA, ...shared]);
  await seed(fb, [...ownB, ...shared]);
  const go = join(dir, "d.go");
  const pa = runChild("sync", fa, go, token);
  const pb = runChild("sync", fb, go, token);
  await sleep(1500);
  writeFileSync(go, "");
  const [ra, rb] = await Promise.all([pa, pb]);
  check("D: both devices ran to quiescence and reported", ra.summary !== null && rb.summary !== null,
    `A code=${String(ra.code)} B code=${String(rb.code)}`);
  const docsA = await settled("D device A", token, fa, [...ownA, ...shared]);
  const docsB = await settled("D device B", token, fb, [...ownB, ...shared]);
  const sameDoc = shared.every((b) => docsA.get(b.id) !== undefined && docsA.get(b.id) === docsB.get(b.id));
  check("D: both devices hold the SAME doc_no for each shared bill", sameDoc);
  const creators = shared.map((b) => {
    const all = [...(ra.summary?.outcomes[b.id] ?? []), ...(rb.summary?.outcomes[b.id] ?? [])];
    return { accepted: all.filter((k) => k === "accepted").length, duplicate: all.filter((k) => k === "duplicate").length };
  });
  console.log(`  shared bills, accepted/duplicate across both devices: ${creators.map((c) => `${String(c.accepted)}/${String(c.duplicate)}`).join(" ")}`);
  // Did the two devices' sends of the SAME bill overlap in time? Reported, not required: a race is
  // a coin (lessons/a-lock-is-proven-by-what-waits-not-by-a-race.md); the invariant above must hold
  // under every interleaving, and the server's side of the same-key race is prove_money_faults F1.
  const overlapped = shared.filter((b) => (ra.summary?.spans[b.id] ?? []).some(([s1, e1]) =>
    (rb.summary?.spans[b.id] ?? []).some(([s2, e2]) => s1 < e2 && s2 < e1))).length;
  const windowA = Object.values(ra.summary?.spans ?? {}).flat();
  const windowB = Object.values(rb.summary?.spans ?? {}).flat();
  const span = (w: [number, number][]) => [Math.min(...w.map((x) => x[0])), Math.max(...w.map((x) => x[1]))];
  const [a0, a1] = span(windowA);
  const [b0, b1] = span(windowB);
  console.log(`  sends of the same shared bill that overlapped across the devices: ${String(overlapped)} of 5`);
  check("D: the two devices' sync windows OVERLAPPED in time (they ran together, not one after the other)",
    windowA.length > 0 && windowB.length > 0 && (a0 ?? 0) < (b1 ?? 0) && (b0 ?? 0) < (a1 ?? 0),
    `A ${String(a0)}..${String(a1)}  B ${String(b0)}..${String(b1)}`);
  check("D: each shared bill was CREATED by exactly one device and answered DUPLICATE to the other",
    creators.every((c) => c.accepted === 1 && c.duplicate >= 1));
  const allIds = new Set([...ownA, ...shared, ...ownB].map((b) => b.id));
  const allDocs = new Set([...docsA.values(), ...docsB.values()]);
  check("D: 17 distinct bills on the server, 17 distinct doc_nos across both devices",
    allIds.size === 17 && allDocs.size === 17 && (await onServer(token, [...allIds])) === 17);
}

async function main(): Promise<void> {
  if (!API) {
    console.log("REFUSED: RECYCLE_API_BASE is not set. This proof writes bills; it will not guess a server"
      + " (a default :8000 may be the dev database). tools/prove_all.py sets it (MOBILE_LIVE).");
    process.exitCode = 2;
    return;
  }
  const token = await login();
  if (token === null) {
    console.log(`REFUSED: the seeded tenant-A admin cannot sign in at ${API} -- no server, or not a copy of dev.`);
    process.exitCode = 2;
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "prove-syncfaults-"));
  try {
    await k1(token, dir);
    await k2(token, dir);
    await twoDevices(token, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? "ALL SYNC-FAULT CASES PASSED" : `FAILED — ${String(failures)} check(s)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err: unknown) => {
    console.error("SYNCFAULTS PROOF CRASHED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(`PROVE_SYNCFAULTS_EXIT=${String(process.exitCode ?? 0)}`);
  });

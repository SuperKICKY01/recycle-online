> MOVED 2026-08-29 from the repo root into research/, untracked since 2026-08-10, measurements rotted — read as a snapshot of the shas it names, not as current.

RAW DUMP of one agent dispatch (argus, mobile client read) held in this
session's context, written to disk 2026-08-10. NOT a repo document: it owns no
claim, supersedes nothing, and is cited by nothing.
Status is owned by PROJECT_STATUS.md.

## TASK 1 — wall clock, before dispatch

```
2026-08-10 22:29:21 +0700 (SEAST)   /   2026-08-10T15:29:21Z
```

---

## TASK 2 — size, measured here

**Definitions.** "Files" = paths tracked by git under the tree (`git ls-files`), filtered by extension. "Lines" = **LF bytes** (count of `\n`). Both sets have **zero** files without a trailing newline, so LF-byte count and content-line count are identical here — the ambiguity CLAUDE.md warns about does not bite on this measurement.

**Mobile client source — extensions `.ts` and `.tsx`, everything tracked under `mobile/`:**

| | files | lines |
|---|---|---|
| `mobile/App.tsx` + `mobile/index.ts` | 2 | 1,522 |
| `mobile/app/` (screens, api, config) | 14 | 2,954 |
| `mobile/src/` — non-proof | 32 | 8,322 |
| `mobile/src/proof/` — headless proof harness | 21 | 13,338 |
| **TOTAL** | **69** | **26,136** |

Product code without the proof harness: **48 files, 12,798 lines**. The harness is 51% of the tree.

**Server source — extension `.py`, everything tracked under `server/`:**

| | files | lines |
|---|---|---|
| `server/app/` — the API itself | 13 | 4,623 |
| `server/migrations/` (env.py + 9 versions) | 10 | 1,612 |
| `server/scripts/` — of which `prove_*.py` is 17 files / 8,497 lines | 24 | 12,104 |
| **TOTAL** | **47** | **18,339** |

**The answer to the question TASK 2 asked:** the client is **1.43× the server** by tracked source lines. Comparing only what serves requests against only what the app ships — `server/app/` 4,623 vs mobile non-proof 12,798 — the client is **2.77×** the server.

**Exclusions, stated explicitly.** Mobile: `node_modules/`, `dist/` (build output, gitignored at `mobile/.gitignore:2`), `.expo/`, `assets/` (6 `.png`), `package-lock.json`, `package.json`, `app.json`, `tsconfig.json`, `tsconfig.node.json`, `metro.config.js`, `tools/finish-build.mjs`, `.gitignore`. Server: `.venv/`, `__pycache__/`, `uv.lock`, `alembic.ini`, `pyproject.toml`, `docker-compose.yml`, `README.md`, `.env`/`.env.example`, `db/init/*.sql`, `migrations/script.py.mako`, `.uvicorn.*.log`, `.gitignore`, `.gitkeep`. Nothing generated and nothing vendored is in either figure. `app.json` being excluded matters for one reading of argus's Q1 — it holds the server address as data.

**Commands.** No PowerShell `>` and no `Measure-Object -Line` anywhere. The one redirect used is Git Bash's, which is a byte copy, not `Out-File`.

```
git ls-files mobile | grep -E '\.(ts|tsx)$' | sort
git ls-files mobile | grep -E '\.(ts|tsx)$' | xargs wc -l | tail -1     # 26136
git ls-files server | grep -E '\.py$'  | sort
git ls-files server | grep -E '\.py$'  | xargs wc -l | tail -1          # 18339
```

**Second, independent instrument** (CLAUDE.md requires one for a number a decision rests on): a Python script reading each file with `Path.read_bytes()` and counting `b"\n"` — a different program on a different code path from `wc`. It returned `FILES=69 LF_BYTES=26136` and `FILES=47 LF_BYTES=18339`, `COUNT_EXIT=0` both times. **Two instruments, same numbers.** It also reports 9 mobile `.ts` files and 1 server `.py` file carrying CR bytes in the working tree.

---

## TASK 4 — wall clock, after argus returned

```
2026-08-10 22:39:28 +0700 (SEAST)   /   2026-08-10T15:39:28Z
```

Elapsed: **10 min 07 s**. The report fits in one piece; nothing is truncated. Below is argus's report **verbatim**, complete, from its first word to its last. The only thing omitted is the harness's own trailing `agentId:`/usage line, which argus did not write.

---
--- BEGIN ARGUS REPORT (VERBATIM) ---

Survey complete. I hold no clock — my tools are Read, Grep and Glob, none of which reports the time. Every negative below is marked `(as of this dispatch)`; the timestamp is the dispatching session's half, recorded beside this report.

**Files chosen and how.** Two Glob runs (`mobile/src/**/*.{ts,tsx}` → 53 paths; `mobile/app/**/*.{ts,tsx}` → 14 paths, both counted by hand off the returned path lists) plus `mobile/*` for root files. I selected by filename against the eight questions, then followed greps. Opened **in full: 19 mobile files**; **in part: 2**; **not opened: 53** (listed under UNREAD).

---

# FOUND

## Q1 — What the configuration module hard-codes

`mobile/app/config.ts` is the only config module. Four constants.

**Addresses / settings:**

    mobile/app.json:30    "apiBaseUrl": "http://192.168.1.238:8000"
    mobile/app/config.ts:24  export const API_BASE_URL: string = extra.apiBaseUrl;

`config.ts:2` states the rule: `"THE server URL. This is the only place it exists."` It fails closed — `config.ts:18-22` throws `"expo.extra.apiBaseUrl is missing from app.json — the app has no server to talk to."`

**Credentials and identifiers** — all three in one object, `mobile/app/config.ts:34-38`:

    export const DEMO = {
      tenantId: "11111111-1111-1111-1111-111111111111",
      username: "admin",
      password: "tenantA-pw-123",
    } as const;

Classification: `tenantId` is an **identifier**; `username` is an **identifier**; `password` is a **secret credential in plaintext in tracked source**. The file's own header, `config.ts:27`, calls it `"Seeded tenant-A login, still hardcoded because there is no login form yet."` and `config.ts:32-33` adds `"A real login screen and customer selection come later."`

One further hard-coded identifier, not a credential, `mobile/src/device/secureTokenStore.ts:35`:

    /** Namespaced so a future second value cannot collide with this one. */
    const KEY = "recycle.session.token";

And the database filename, `mobile/App.tsx:452`: `const driver = await ExpoSqliteDriver.open("recycle.db");`

## Q2 — Where the session token is stored

**The write** — `mobile/src/device/secureTokenStore.ts:53`:

      await SecureStore.setItemAsync(KEY, token, OPTIONS);

**The read** — `mobile/src/device/secureTokenStore.ts:44`:

      return await SecureStore.getItemAsync(KEY, OPTIONS);

**Does it survive close-and-reopen? Answered from the API, not the name.** The API is `expo-secure-store`, imported at `secureTokenStore.ts:30`: `import * as SecureStore from "expo-secure-store";`. `secureTokenStore.ts:14-16` names the backing store: `"so it goes in the platform's encrypted store (Keychain / Android Keystore) rather than into recycle.db"`. The persistence option is set at `secureTokenStore.ts:37-39`:

    const OPTIONS: SecureStore.SecureStoreOptions = {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    };

`secureTokenStore.ts:23` records the one case where the read fails: `"It is still not readable on a phone that has not been unlocked since power-on."`

The boot path reads it back — `mobile/App.tsx:490`: `const token = await tokenStoreRef.current.load();`, wired to the persistent implementation at `App.tsx:349`: `const tokenStoreRef = useRef(new SecureTokenStore());`

**The non-persistent sibling exists and is not what the app uses.** `mobile/src/session/tokenStore.ts:91-111` defines `MemoryTokenStore`; `tokenStore.ts:86` names its two uses: `"the headless proof (expo-secure-store cannot run under node), and any platform where the keystore is unavailable"`.

## Q3 — Is there a login screen?

**No login screen and no credential input.** What exists is a single button. `mobile/App.tsx:1262-1271`:

        ) : token === null ? (
          <View style={styles.center}>
            <Pressable
              style={[styles.loginBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => void signIn()}
            >
              <Text style={styles.loginText}>เข้าสู่ระบบ (ร้าน A)</Text>
            </Pressable>
          </View>

It asks for **nothing**. How the app obtains a session — `mobile/App.tsx:795`:

      const t = await login(DEMO.tenantId, DEMO.username, DEMO.password);

A second entry point to the same function, `mobile/app/StatusStrip.tsx:74-78`, renders `notice.action.label`, which for the session case is `"เข้าสู่ระบบ"` (`mobile/src/sync/statusNotice.ts:101`). `StatusStrip.tsx:33-37` states why it exists: `"that screen renders on \`token === null\` — which is exactly false when a token has EXPIRED, so an operator whose session ran out had no button to press anywhere on the device."`

Patterns and controls are under NOT FOUND.

## Q4 — How the app calls the API

**Two request-issuing modules, not one. There is no single chokepoint.** The split is deliberate and documented — `mobile/app/api.ts:2-3`: `"Thin HTTP client for the reads the form needs. Bill submission does NOT go through here — that is the sync engine's job, offline-first."`

**Module A — `mobile/app/api.ts`, 3 sites.** One quoted verbatim, `api.ts:55-57`:

      const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });

The other two are **not** byte-identical to it and each gets its own quote.
`api.ts:69-73`:

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, username, password }),
      });

`api.ts:124-127`:

        res = await fetch(`${API_BASE_URL}/reports/daily${query}`, {
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

**Module B — `mobile/src/adapters/httpTransport.ts`, 2 sites**, both through an injected `fetchImpl`.
`httpTransport.ts:100-108`:

          response = await this.fetchImpl(`${this.baseUrl}/bills`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(bill.payload),
            signal: controller.signal,
          });

`httpTransport.ts:196-204` is the **same shape only** (differs: URL is `/bills/${bill.id}/void`, body is `JSON.stringify({ reason })`).

The real `fetch` is injected at `mobile/App.tsx:466`: `fetchImpl: (input, init) => fetch(input, init),`

**Every call site of the api.ts functions** (all in `App.tsx`): `:407` `const ps = await fetchProducts(token);` · `:419` `const ss = await fetchSellers(token);` · `:717` `const result = await fetchDailyReport(t, date);` · `:795` the `login` call quoted above.

## Q5 — What the app does on a 401

**This is the question with a split answer: the sync and read paths distinguish rigorously; the login request itself does not.**

**The distinction is made at the type level.** `mobile/src/sync/types.ts:289` and `:318` are separate union members:

      | { kind: "session_expired"; reason: string }
      | { kind: "unavailable"; reason: string; reachable: boolean };

`types.ts:216-219` states the axis: `"Within \`unavailable\`, \`reachable\` records whether the SERVER ANSWERED at all: true for an HTTP status we could not use (a 5xx ...), false for a transport-level failure (timeout, DNS, no connection, no token — we never got a word back)."`

**The code that decides.** `mobile/src/adapters/httpTransport.ts:132-137`:

        if (response.status === 401) {
          // The token expired, was revoked, or names a user that no longer exists
          // (server/app/auth.py answers all three with 401). The bill is fine and
          // stays queued; only a sign-in unblocks it.
          return { kind: "session_expired", reason: `HTTP 401: ${describe(body.detail)}` };
        }

The network branch, `httpTransport.ts:109-112`:

        } catch (err) {
          // fetch threw: timeout, DNS, no route — we never reached the server.
          const reason = err instanceof Error ? err.message : String(err);
          return { kind: "unavailable", reason: `network: ${reason}`, reachable: false };

The void path's 401 test at `httpTransport.ts:225` is **byte-identical** to `:132` (`    if (response.status === 401) {`), and its return at `:226` is byte-identical to `:136`.

**On the read path**, `mobile/app/api.ts:51-52`:

    export const isUnauthorized = (err: unknown): boolean =>
      err instanceof HttpStatusError && err.status === 401;

Used at `App.tsx:414` and `App.tsx:425`, which are **byte-identical** to each other: `        if (isUnauthorized(err)) expired = true;`. The ranking that follows, `App.tsx:433-443`:

        if (expired) {
          setSessionEnded(true);
          setOnline(true); // the server answered, promptly. This is not an outage.
          return;
        }
        ...
        if (failed) setOnline(false);

**The daily report returns the two as values, never a thrown error** — `api.ts:128-130`: `return { kind: "unreachable" };` versus `api.ts:152`: `return { kind: "http", status: res.status, code };`

**What the operator sees differs.** `mobile/src/sync/statusNotice.ts:89-103` (session, amber, carries a sign-in button) versus `statusNotice.ts:219-228`:

      if (s.online === false) {
        return {
          tone: "warn",
          message:
            s.pending > 0
              ? `ออฟไลน์ — เก็บไว้ในเครื่อง ${String(s.pending)} ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
              : "ออฟไลน์ — บันทึกได้ตามปกติ",
          action: null,
        };
      }

**THE EXCEPTION, and it is on the path a login screen will use.** `login()` does carry the status — `api.ts:74`:

      if (!res.ok) throw new HttpStatusError(res.status, `login -> HTTP ${String(res.status)}`);

But its only caller discards it. `mobile/App.tsx:830-833`:

        } catch (err) {
          setOnline(false);
          setStatus(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
        } finally {

`setOnline(false)` is unconditional. A wrong password (server answered 401) and an unreachable server (fetch threw) both land here and both render the `ออฟไลน์` branch quoted above. `isUnauthorized` is imported into this file (`App.tsx:91`) and is **not** called in `signIn`. The control for this negative is the strongest available — the same pattern hits three times elsewhere in the same file; see NOT FOUND.

## Q6 — Unsynced bills, and the token dying mid-queue

**Storage: SQLite, one table.** `mobile/src/adapters/sqlite/schema.ts:33-85` creates `local_bills`; `schema.ts:4` states the money rule: `"MONEY AND WEIGHT ARE TEXT. This is not a style choice."` and `schema.ts:11-13`: `"So every amount and weight lives inside payload_json, a TEXT column, exactly as the decimal string the server will receive."`

**Retry policy** — `mobile/src/sync/engine.ts:678-681`:

      private backoffFor(attempt: number): number {
        const raw = this.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
        return Math.min(raw, this.backoffMaxMs);
      }

Configured at `App.tsx:469-470`: `backoffBaseMs: 2000,` / `backoffMaxMs: 30000,`. No attempt cap — `engine.ts:649-651`: `"No attempt cap on purpose: a yard can be offline for days, and a bill marked \`failed\` for being offline would be a lie."`

**Refused vs unreachable — the two are handled by different store transitions.** Refused-because-the-session-died, `engine.ts:614-618`:

            const now = this.clock.now();
            const next = new Date(now.getTime() + this.backoffFor(attempt));
            await this.store.markSessionExpired(bill.id, outcome.reason, attempt, next, now);
            result.sessionExpired += 1;
            return;

That statement, `mobile/src/adapters/sqlite/SqliteLocalStore.ts:356-364`, returns the bill to `pending` and clears the poison columns:

          `UPDATE local_bills
           SET sync_state = 'pending', attempt_count = ?, last_error = ?,
               next_attempt_at = ?,
               first_attempt_at = COALESCE(first_attempt_at, ?),
               first_server_error_at = NULL, server_error_attempts = 0
           WHERE id = ?`,

The reason, `SqliteLocalStore.ts:340-343`: `"while a 401 was classified \`unavailable, reachable: true\`, every bounce stamped first_server_error_at and incremented server_error_attempts, so an expired session with bills behind it reached POISON_ALARM_ATTEMPTS and raised the red \"ติดต่อฝ่ายสนับสนุน\" alarm. There is nothing for support to do."`

**The second way the token can die — 403 — stops the loop entirely.** `engine.ts:637-644` calls `markSendForbidden` then `this.sendForbidden = true;`, and the loop is gated at `engine.ts:310`:

        for (let guard = 0; !this.sendForbidden && guard < this.batchLimit; guard += 1) {

`SqliteLocalStore.ts:390-397` is the same UPDATE shape as `markSessionExpired` above — **same shape only**, differing in that `next_attempt_at` is bound to `nowIso` rather than a computed `retryAt`. `SqliteLocalStore.ts:377-379` says why: `"WHAT IS DIFFERENT: next_attempt_at = now, no backoff. There is no schedule to write."`

**Nothing is lost.** `engine.ts:604-606`: `"the bill goes back to pending untouched"`. The queue resumes on sign-in — `engine.ts:223-226`:

        this.sendForbidden = false;
        const freed = await this.store.clearBackoffForPending(now);
        const unrefused = await this.store.clearVoidRefusals(now);
        return freed + unrefused;

**Owed voids behave differently from owed sends.** `engine.ts:438-444` marks a 401'd void failed but leaves it owed; `engine.ts:462-468` calls `markVoidRefused` for a 403, which removes it from the owed queue via `SqliteLocalStore.ts:618-624` (`AND void_refused_at IS NULL`). `SqliteLocalStore.ts:614-617` records the defect that caused: `"it stays here and is re-POSTed on every pass — and unlike the send queue there is no backoff column on this path at all, so \"retry\" means every 4 seconds, forever"`.

**A queued bill blocks sign-out.** `mobile/src/session/signOut.ts:325-329`:

      if (deps.pending > 0) {
        // NOTHING has been touched at this point — not the loop, not the keystore.
        // A refusal must leave the session exactly as it found it.
        return { kind: "refused_pending", pending: deps.pending, failed: deps.failed };
      }

## Q7 — Tenant identifier outside the configuration module

**One site.** `mobile/src/proof/proveForbidden.ts:703`:

    const TENANT_A = "11111111-1111-1111-1111-111111111111";

Used at `proveForbidden.ts:711`: `body: JSON.stringify({ tenant_id: TENANT_A, username, password }),`

Two credential literals sit beside it — `proveForbidden.ts:731-732`:

      const staffToken = await login("staff", "tenantA-staff-789");
      const adminToken = await login("admin", "tenantA-pw-123");

`"tenantA-pw-123"` at `:732` is **byte-identical** to the value at `config.ts:37`. `"tenantA-staff-789"` at `:731` appears nowhere else in `mobile/` under the pattern run.

`App.tsx:795` **references** `DEMO.tenantId` but hard-codes nothing.

## Q8 — What the client records about itself that a designer must not contradict

**The token-persistence decision was reversed once, on purpose, and the reasoning is written down to be argued with.** `mobile/src/session/tokenStore.ts:9-14`: `"THIS REVERSES AN EARLIER DECISION, ON PURPOSE ... Until Phase 2c-8 the token was held in a React ref and nothing else, and an audit praised that ... That reasoning was sound and the conclusion was still wrong, because it weighed only one of the two risks."` The trade is tabulated at `tokenStore.ts:25-31`.

**There is no offline login, and one file says so explicitly.** `mobile/src/session/signOut.ts:302-305`: `"WHY THAT GATE COSTS THE YARD NOTHING. Signing back IN requires the network: there is no offline login path, \`signIn()\` calls the server."`

**A gate that looks protective is recorded as NOT proven protection — and it names a login screen as the thing that makes the hazard reachable.** `signOut.ts:307-318`: `"a bill draining under a DIFFERENT user. That hazard is NOT REACHABLE TODAY, because signIn() uses the hardcoded DEMO credentials in app/config.ts — signing out and back in returns the same account, and there is no login form to type another. It becomes reachable when R5 introduces real per-shop accounts. At that point the worse case is a different TENANT: the queued bill's seller_id and product_id are invisible under the new tenant's RLS context, so POST /bills answers 422, which the engine maps to markFailed — TERMINAL, never retried, a paid-for load permanently stuck. This gate happens to prevent that, but it has never been exercised against it and must not be cited as evidence about it."`

**An expired token is deliberately not deleted, and the reason is the login screen.** `mobile/App.tsx:273-277`: `"AND THE EXPIRED TOKEN ITSELF IS DELIBERATELY NOT DELETED from the keystore. Deleting it would make the next launch \`token === null\`, which renders the LOGIN SCREEN — putting the yard back at the one screen an offline morning cannot get past"`.

**The login screen's render condition is already known to be wrong for expiry.** `mobile/src/sync/statusNotice.ts:86-88`: `"the app's own login button renders on \`token === null\`, which is exactly false when a token has expired."`

**There is deliberately no refresh token.** `mobile/src/sync/types.ts:285-286`: `"There is deliberately NO refresh token (Phase 2c-7 scope). Re-login is the recovery"`. And `App.tsx:258-259`: `"JWT_TTL is 3600s and there is no refresh token — re-login IS the recovery, by decision"`.

**A 403 must never offer a sign-in.** `mobile/src/sync/parkedReason.ts:118-121`: `"It never invites a sign-in. Signing in returns the SAME user with the SAME role, so \"try signing in again\" is a loop with a person in it."`

**The role read from the token fails OPEN, against the usual rule.** `mobile/src/session/deviceRole.ts:23-25`: `"IT FAILS OPEN. An unparseable token, a missing claim, an unrecognised value: all of them read as \"unknown\", and unknown offers the button. That is the opposite of the rule in lessons/config-defaults-must-fail-closed.md"`.

**The device token store is marked unverified.** `mobile/src/device/secureTokenStore.ts:4-9`: `"============================ NOT EXECUTED ============================ ... nothing here runs under node and no proof reaches it ... that this file honours the contract is UNVERIFIED until it runs on a phone."`

**A known limit in what sign-out clears.** `signOut.ts:222-226`: `"this catches the list growing, not the APP growing. A new useState added to App.tsx and never added to ClearedSession is invisible to both the compiler and the proof ... Closing that direction means App.tsx holding ONE session state value — 45 setter sites and ~88 read sites"`. (Those two figures are quoted from the file; I did not measure them.)

**Decisions live in `src/` because `app/` is unreachable by proofs.** `mobile/app/StatusStrip.tsx:9-14`: `"app/ is unreachable by the headless proofs, so while the wording lived here it could not be asserted on — and an expired session was displayed as ออฟไลน์ with every proof green, because none of them could see this file."` The same constraint is stated at `signOut.ts:5-7` and `statusNotice.ts:5-8`.

---

# NOT FOUND

**SEARCHED AND NOT PRESENT (as of this dispatch): any credential input field in the client.**
- pattern: `TextInput|secureTextEntry|placeholder` over `mobile/app`
- control: the pattern **fired** — 13 matching lines in 4 files, e.g. `mobile/app/SellerPicker.tsx:106` `<TextInput`. None is bound to a username or password.
- pattern: `password|username|Login|LoginScreen|signIn` over `mobile/app`
- control: the pattern **fired** — 5 matching lines. All 5 are `api.ts:66,67,72` (function parameters) and `config.ts:36,37` (the constants). No screen.

**SEARCHED AND NOT PRESENT (as of this dispatch): `isUnauthorized` or any 401 test inside `signIn`.**
- pattern: `isUnauthorized|HttpStatusError|status === 401` over `mobile/**/*.{ts,tsx}`
- control: the pattern **fired three times in the very file concerned** — `App.tsx:414`, `App.tsx:425`, `App.tsx:724` — and did not fire anywhere in the `signIn` body (`App.tsx:792-836`). Same file, same pattern, hits above and below the range.

**SEARCHED AND NOT PRESENT (as of this dispatch): AsyncStorage or localStorage anywhere in the client.**
- pattern: `AsyncStorage|localStorage|SecureStore|expo-secure-store` over `mobile/src`, and again over `{App.tsx,app/*.ts,app/*.tsx}`
- control: over `mobile/src` the pattern **fired** — 15 matching lines, all on the `SecureStore` / `expo-secure-store` alternatives. The `AsyncStorage` and `localStorage` alternatives matched zero lines in either run. The second run (`App.tsx` + `app/`) returned **no matches at all**, so it carries no internal control; its control is the first run, which used the identical pattern string and fired.

**SEARCHED AND NOT PRESENT (as of this dispatch): the tenant UUID anywhere in `mobile/` beyond the two sites reported.**
- pattern: `11111111` over `mobile` with glob `*.{ts,tsx,json,js}`
- control: the pattern **fired** — 3 matching lines. Two are reported under Q7; the third, `mobile/src/proof/proveEntry.ts:218`, is a keystroke-sequence test string (`"11111111111"`) and not a tenant id.
- pattern: `tenant` case-insensitive, run separately over `mobile/src`, `mobile/app`, and `App.tsx`
- control: **fired in all three** — 18, 7 and 1 matching lines respectively.

**SEARCHED AND NOT PRESENT (as of this dispatch): a `/auth/refresh` or token-renewal call.**
- pattern: `fetch\s*\(` over `mobile/src`, `mobile/app`, and `App.tsx`
- control: **fired in all three** — 4, 4 and 1 matching lines. The complete set of URLs reachable through them is `/auth/login`, `/products`, `/sellers`, `/reports/daily`, `/bills`, `/bills/{id}/void`, plus two proof-only URLs. No refresh endpoint.

**NOT SEARCHED (as of this dispatch): whether any of the 9 unopened `mobile/app/*.tsx` screens renders session or login state.** No pattern was run for it. I ran patterns for `TextInput`, `password|username`, `tenant` and `fetch` across that directory, which is narrower than the question.

**NOT SEARCHED (as of this dispatch): deep-link, biometric, or OS-level auto-fill integration.** No pattern was run for any of these.

**NOT SEARCHED (as of this dispatch): the desktop client and the server's `/auth/login` contract.** Out of the stated subject; no pattern run.

**NOT SEARCHED (as of this dispatch): `mobile/package.json` dependencies.** No pattern was run; I did not open the file.

---

# UNREAD

**Opened only in part (2):**
- `E:\recycle-online\mobile\src\adapters\sqlite\SqliteLocalStore.ts` — read lines 240-419 and 600-699 only. The remaining ~500 lines (including `putBill`, `listReadyToSend`, `markSynced`, `markFailed`, `requestVoid`, `pendingQueueSnapshot`, `toBill`) were not opened.
- `E:\recycle-online\mobile\src\reports\dailyView.ts` — read lines 660-749 only. Lines 1-659 and 750-end not opened.

**Matched a pattern or was named by an import, not opened (9 in `mobile/app`):**
`Numpad.tsx`, `ConfirmSellerChangeDialog.tsx`, `MasterDataStrip.tsx`, `CartScreen.tsx`, `SellerPicker.tsx`, `ConfirmSaveDialog.tsx`, `BillsPanel.tsx`, `DailyScreen.tsx`, `SignOutSheet.tsx` — all under `E:\recycle-online\mobile\app\`. `BillsPanel.tsx`, `SignOutSheet.tsx` and `DailyScreen.tsx` consume `session`, `account` and `role` per `App.tsx:1317-1465` and are the most likely to contain session wording I have not seen.

**Not opened (40 in `mobile/src`), full list:**
`sync/index.ts`, `sync/systemClock.ts`, `sync/createBill.ts`, `session/signOutNotice.ts`, `master/types.ts`, `master/freshness.ts`, `money/money.ts`, `cart/sellers.ts`, `cart/entry.ts`, `cart/types.ts`, `cart/cart.ts`, `time/clockSanity.ts`, `time/shopTime.ts`, `adapters/sqlite/mutex.ts`, `adapters/sqlite/driver.ts`, `adapters/sqlite/nodeDriver.ts`, `adapters/sqlite/SqliteMasterStore.ts`, `adapters/sqlite/SqliteDraftStore.ts`, `device/expoSqliteDriver.ts`, and 21 files under `src/proof/`: `claimWorker.ts`, `harness.ts`, `proveMoney.ts`, `proveEntry.ts`, `fileServer.ts`, `voidCrashChild.ts`, `proveTime.ts`, `cartCrashChild.ts`, `sqliteProof.ts`, `draftCrashChild.ts`, `proveCart.ts`, `proveVoid.ts`, `fakes.ts`, `proveSeller.ts`, `proveSync.ts`, `proveForbidden.ts`, `proveNotice.ts`, `proveDaily.ts`, `proveClock.ts`, `proveCold.ts`, `proveSignOut.ts`.

`proveForbidden.ts` is cited above at four specific lines from grep output only — **I did not open the file**, so I cannot say what else it hard-codes.

**Not opened (4 root config files):** `mobile/package.json`, `mobile/tsconfig.json`, `mobile/tsconfig.node.json`, `mobile/metro.config.js`.

**Not opened, named by the documents but outside the subject:** `PROJECT_STATUS.md`, `ROADMAP.md`, `OPEN_ITEMS.md`, `ARCHITECTURE.md`, `lessons/README.md` and every individual lesson file cited in the code comments above (`401-is-about-the-caller-not-the-bill.md`, `403-is-about-what-the-caller-may-do.md`, `unavailable-is-not-rejected.md`, `correct-classification-can-still-render-as-an-error.md`, and others). **Every lesson filename I quote is quoted from a code comment, not from the lesson file — I did not verify that any of those files exists.**

---

# LIMITS

Reading tells me what the program says. It does not tell me what it did.

- **I have not run anything.** Neither `npm run typecheck` nor `npm run typecheck:app`, neither of which I invoked; no proof; no request. Nothing here is an observation of behaviour.
- **The device path is unverifiable by reading, and the code says so itself.** `secureTokenStore.ts:4-9` marks the whole file NOT EXECUTED. Whether the Keychain write, read or delete actually works on the handset is a device observation; source cannot substitute for it.
- **I cannot tell which bundle a handset would run.** Per `CLAUDE.md § Boot check`, the JS is fetched from Metro's transform cache. Any screen behaviour inferred from this source is about the source, not about what a phone executed.
- **`app.json:30` gives a LAN address as a string.** Whether `192.168.1.238:8000` currently resolves, or whether the box's IP moved, is not readable from source.
- **Counts.** Every figure above states its instrument. The Glob figures (53, 14) are counts of **path strings returned by Glob**, tallied by hand from the printed lists — not an independent measurement, and the same failure mode the project has recorded twice (a count that is silently too small looks exactly like a correct one) applies. The Grep figures are counts of **matching LINES** in Grep's count or content mode; two matches on one line count once. Grep's own summary line says "occurrences" and that wording is wrong. The two figures inside the `signOut.ts` quote (45 setter sites, ~88 read sites) are **quoted from the file and unmeasured by me**.
- **Absence of a pattern match is not absence of the thing.** This is TypeScript, and the brief's warning holds: I preferred alternations and `\s*` over `\b` and line anchors, and every negative above carries a control run of the same pattern string. That reduces the risk; it does not eliminate it. A construct spelled in a way none of my patterns anticipated would read exactly like an absence.
- **The repository has returned different results minutes apart.** Every negative here is a measurement at one moment, not a property of the tree.

--- END ARGUS REPORT (VERBATIM) ---

---

## My own lines, below the report and separate from it

**I verified five of its quotes against the files and all five are byte-accurate.** `config.ts:24` and `:34-38`; `App.tsx:795`, `:830-833`, `:1262-1271`; `proveForbidden.ts:703`. I also confirmed `app.json:30` — and found argus omitted the line above it, `app.json:29`, whose `_comment` says the reader is `device/src/config.ts`. There is no `mobile/device/` directory and no `mobile/src/config.ts`; the actual reader is `mobile/app/config.ts`. **That comment is stale** — a designer following it looks in the wrong place.

**Two of its self-flagged uncertainties I can now close, because I have a shell and it does not.**

1. Its Glob counts — 53 and 14 — which it warned were hand-tallied and might be silently short. `git ls-files` gives **exactly 53 and 14**. Second instrument, same numbers; the undercount it feared did not happen.
2. Its Q7 negative was run over glob `*.{ts,tsx,json,js}`. I ran the same UUID search over **every tracked file under `mobile/` with no extension filter**: **exactly the two sites it reported**. Its negative is stronger than it could establish for itself.

**Where I extend it, on the question it was dispatched for.** `mobile/dist/` — the built bundle, 1.97 MB, dated Jul 22 23:12 — **contains the plaintext password `tenantA-pw-123` and the tenant UUID**, in `dist/proof/proveForbidden.js` and in the iOS Hermes bytecode `dist/_expo/static/js/ios/index-a45b08624411fb5367e0618bda9a9b53.hbc`. Argus structurally could not see this: `dist/` is gitignored at `mobile/.gitignore:2`, and ripgrep skips ignored paths. So `config.ts:37` is not the only place that credential exists on this disk — **it has already been compiled into a shipped artifact**, which is a different fact from "hardcoded in source" and matters to whoever removes it.

**One thing I checked and did NOT find wrong.** Its control count "`fetch\s*\(` fired 4 times in `mobile/app`" looked like an error to me, since there are only 3 real call sites. Re-running the exact regex returns 4 — the fourth is `api.ts:40`, a comment containing "a thrown fetch (". Argus's count was right and its LIMITS section had already declared it was counting matching lines, not call sites. I am recording the check because a disagreement I raised and dropped is worth more to you than one I quietly deleted.

---

**TASK 5 — what in this prompt turned out to be wrong:** one thing. The dispatch's premise that "every statement about it in the repository's documents is derived from reading the server or from prose" is false where it matters most — the mobile client's own source carries first-hand statements about precisely the screen being designed (`statusNotice.ts:86-88` records that the login button's `token === null` condition is already wrong for an expired session; `signOut.ts:307-318` names the login screen as what makes a cross-tenant queue hazard reachable; `App.tsx:273-277` explains that an expired token is deliberately left in the keystore *because* deleting it would strand the yard at that screen) — so someone has read and reasoned about this code in detail; what is true is that those statements live only in code comments and never reached the documents. Everything else held: the counting prohibitions were correct (`Measure-Object -Line` and the PowerShell `>` were both avoided, and neither was needed), the TypeScript instrument warning was warranted, and TASK 2's open question is answered — the client is 1.43× the server overall, 2.77× comparing shipped code to the API alone.

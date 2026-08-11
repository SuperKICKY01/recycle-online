/**
 * Sync engine. PURE TypeScript — imports nothing but ./types.js.
 *
 * No React Native, no Expo, no node builtins. Production wires it to
 * expo-sqlite and fetch through the LocalStore/Transport interfaces; the proof
 * wires it to in-memory fakes. The engine cannot tell the difference, which is
 * exactly why it can be proven headless.
 */
import { SEND_SCHEDULE_HORIZON_MS, scheduledInstantIsDue } from "../time/clockSanity.js";
import { VOID_REJECTED_CODE } from "./types.js";
import type {
  Clock,
  LocalBill,
  LocalStore,
  SendOutcome,
  Transport,
  VoidOutcome,
} from "./types.js";

export interface SyncEngineOptions {
  store: LocalStore;
  transport: Transport;
  clock: Clock;
  /** First retry delay; doubles per attempt up to backoffMaxMs. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Bills examined per pass. Bounds the work of one run; not a retry cap. */
  batchLimit?: number;
  /**
   * How long a bill parked on missing master data waits before it is retried
   * automatically. Deliberately SLOW and deliberately not a backoff: retrying
   * sooner cannot make the office add a price faster, and the operator has an
   * explicit retry for the moment they have added it.
   */
  masterDataRetryMs?: number;
}

export interface SyncRunResult {
  /** Bills this pass actually claimed and sent. */
  attempted: number;
  /** Reached the server (accepted or already-existed). */
  synced: number;
  /** Outcome unknown or unreachable — back to pending, will retry. */
  retryable: number;
  /** Server refused the bill on its merits — terminal, visibly failed. */
  rejected: number;
  /** Already in flight elsewhere; skipped rather than double-sent. */
  skippedInFlight: number;
  /** Voids confirmed by the server this pass (including "already voided"). */
  voidsApplied: number;
  /** Void attempts whose outcome is unknown — still owed, will retry. */
  voidsRetryable: number;
  /** Voids the server refused outright. */
  voidsRejected: number;
  /** Pending bills whose stale backoff was released by a successful send. */
  backoffsCleared: number;
  /** Bills the server refused for a RESOLVABLE reason; parked, not failed. */
  masterDataBlocked: number;
  /** Parked bills whose slow retry came due and were returned to the queue. */
  masterDataReleased: number;
  /**
   * Sends or voids that bounced because THE SESSION ENDED (401).
   *
   * Reported separately from `retryable` on purpose, because the UI's reaction
   * is different and opposite: `retryable` means "wait, it will go by itself"
   * and this one means "it will NOT go by itself — sign in". Folding it into
   * retryable is exactly how an expired session came to be displayed as ออฟไลน์.
   */
  sessionExpired: number;
  /**
   * Sends the server REFUSED on identity grounds (403): this account may not
   * submit bills.
   *
   * Separate from every other counter because the reaction is different from all
   * of them: `retryable` means wait, `sessionExpired` means sign in, `rejected`
   * means this bill is broken — and this one means NOTHING ON THIS DEVICE will
   * change the answer. It is also the signal that stops the send loop; see
   * sendForbidden below.
   */
  forbidden: number;
  /** Voids the server refused on identity grounds (403). Not owed any more. */
  voidsForbidden: number;
}

const emptyResult = (): SyncRunResult => ({
  attempted: 0,
  synced: 0,
  retryable: 0,
  rejected: 0,
  skippedInFlight: 0,
  voidsApplied: 0,
  voidsRetryable: 0,
  voidsRejected: 0,
  backoffsCleared: 0,
  masterDataBlocked: 0,
  masterDataReleased: 0,
  sessionExpired: 0,
  forbidden: 0,
  voidsForbidden: 0,
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class SyncEngine {
  private readonly store: LocalStore;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly batchLimit: number;
  private readonly masterDataRetryMs: number;

  /** Fast in-process guard. The durable guard is store.claimForSend. */
  private readonly inFlight = new Set<string>();

  /**
   * THE SERVER HAS REFUSED THIS ACCOUNT'S BILL SUBMISSIONS (403). While it is
   * set, the send loop does not run at all.
   *
   * DEVICE-GLOBAL AND IN MEMORY, deliberately, and this is where the 401 lesson's
   * rule 4 applies unchanged: a 403 on POST /bills refuses EVERY bill equally, so
   * it is a fact about the account and not about any row. Storing it per bill
   * would leave N copies to be retracted one at a time, each outliving its own
   * truth the moment the role changed.
   *
   * NOT PERSISTED, and that is the honest choice rather than a shortcut: it is a
   * claim about what the SERVER said last, and a stored one would be a guess
   * about what it will say next. A restart therefore costs exactly one request —
   * the first send is tried, refused, and the flag is set again. That single
   * request is also the only way the app can ever discover the role WAS fixed, so
   * paying it once per launch is a feature, not a leak. (The other retraction is
   * resumeAfterSignIn: a sign-in is the one event on this device that can change
   * who the caller is.)
   *
   * It gates only the SEND loop. Voids are refused per bill and settled durably —
   * blocking them here would strand a synced bill's void behind a submit
   * permission it has nothing to do with.
   */
  private sendForbidden = false;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.transport = opts.transport;
    this.clock = opts.clock;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    this.backoffMaxMs = opts.backoffMaxMs ?? 5 * 60_000;
    this.batchLimit = opts.batchLimit ?? 100;
    this.masterDataRetryMs = opts.masterDataRetryMs ?? 5 * 60_000;

    /*
     * THE HORIZON MUST DOMINATE EVERY DELAY THIS ENGINE CAN WRITE.
     *
     * `next_attempt_at` is trusted only up to SEND_SCHEDULE_HORIZON_MS out;
     * past that it is read as evidence the clock moved and the bill is treated
     * as due (time/clockSanity.ts). If a knob were ever raised above the
     * horizon, this engine would write real schedules that its own reader
     * discards — a backoff silently reduced to zero, which is the kind of
     * defect that shows up as "the server is being hammered" months later and
     * is never traced back to a constant.
     *
     * A throw, not a comment and not a clamp: it fires at construction, on
     * every path that builds an engine including the proofs, so the two numbers
     * cannot drift apart in silence.
     */
    for (const [name, ms] of [
      ["backoffMaxMs", this.backoffMaxMs],
      ["masterDataRetryMs", this.masterDataRetryMs],
    ] as const) {
      if (ms > SEND_SCHEDULE_HORIZON_MS) {
        throw new Error(
          `${name}=${String(ms)}ms exceeds SEND_SCHEDULE_HORIZON_MS=` +
            `${String(SEND_SCHEDULE_HORIZON_MS)}ms: schedules this engine writes` +
            " would be discarded as clock damage by its own reader. Raise the" +
            " horizon in time/clockSanity.ts deliberately, or lower the knob.",
        );
      }
    }
  }

  /**
   * The operator has added the missing price and wants to see it clear NOW.
   * Releases every parked bill regardless of its slow cadence; the next pass
   * sends them in weighing order.
   */
  async retryMasterDataNow(): Promise<number> {
    return this.store.releaseMasterDataBlocked(this.clock.now(), true);
  }

  /**
   * The operator has signed in again. Returns how many records were freed to be
   * tried again — backoffs cleared PLUS void refusals retracted, because both are
   * "work that was blocked and no longer is", and the caller's only use of the
   * number is deciding whether to kick a sync pass now.
   *
   * Every backoff currently on the queue was computed while there was no usable
   * session, which is not a fact about the network at all — so without this the
   * yard signs in, sees the sign-in succeed, and then watches nothing happen for
   * up to backoffMaxMs. Same reasoning as clearBackoffForPending after a
   * successful send: the delay was computed against a world that no longer
   * exists. It does NOT re-send anything itself; the next pass does that, in
   * weighing order, with the same idempotency keys.
   */
  async resumeAfterSignIn(): Promise<number> {
    const now = this.clock.now();
    /*
     * A SIGN-IN IS THE ONLY EVENT ON THIS DEVICE THAT CAN CHANGE WHO IS ASKING,
     * so it is the only thing allowed to retract a 403. Both refusals go: the
     * device-global submit block, and every per-bill void refusal.
     *
     * If the same staff user signs back in, each refused thing is re-asked
     * exactly once and lands back where it was. That is one request, not a loop,
     * and it is the price of the app not having to guess when a role changed.
     *
     * KNOWN LIMIT, stated rather than hidden: a role changed in the back office
     * while this session continues is invisible here until the next sign-in. The
     * token's TTL is one hour and there is no refresh, so in practice a shift
     * re-asks at least hourly. Nothing else on the device is evidence about a
     * role, and inventing a poll would be a request that exists to make the app
     * feel responsive rather than to answer a question anyone asked.
     */
    this.sendForbidden = false;
    const freed = await this.store.clearBackoffForPending(now);
    const unrefused = await this.store.clearVoidRefusals(now);
    return freed + unrefused;
  }

  /**
   * A SIGN-OUT happened on this device (R1b). Drop the device-global send gate.
   *
   * `sendForbidden` means "the server refused THIS ACCOUNT's submits", and the
   * account has just left. Carrying it across a sign-out would gate the next
   * user's send loop on a refusal that was never about them — the same class of
   * mistake as leaving the previous user's role on screen.
   *
   * SYNCHRONOUS AND STORE-FREE, deliberately, which is why it is not a sibling
   * of resumeAfterSignIn. That method also clears backoff and per-bill void
   * refusals; NEITHER belongs here. A backoff is a fact about the network and
   * survives a change of operator, and a refused void is recorded on its own row
   * as money the yard believes is cancelled and the server still holds live —
   * wiping that on sign-out would erase a disagreement about money because
   * somebody's shift ended. Both are retracted on the next SIGN-IN, which is the
   * event that can actually change the answer.
   */
  resetAfterSignOut(): void {
    this.sendForbidden = false;
  }

  /**
   * Call once at startup, BEFORE any sync run.
   *
   * A bill in `syncing` means a send was in progress when the process died. We
   * do not ask the server whether it landed: re-sending carries the same
   * idempotency key, so the server itself resolves it — a duplicate submit
   * returns the existing bill instead of creating a second one. That makes
   * recovery a plain state reset rather than a distributed query.
   */
  async recoverInterrupted(): Promise<string[]> {
    return this.store.resetSyncingToPending(this.clock.now());
  }

  /**
   * One pass over the bills whose backoff has elapsed.
   *
   * The queue is RE-READ after every send rather than snapshotted once. A
   * successful send clears the stale backoff on every other pending bill, and
   * re-reading is what lets those freed bills be picked up in this same pass,
   * in device_created_at order, instead of waiting for the next tick.
   *
   * `attempted` bounds the loop: a bill is tried at most once per pass, so a
   * bill that returns to pending cannot be retried in a tight spin.
   */
  async runOnce(): Promise<SyncRunResult> {
    const result = emptyResult();
    const attempted = new Set<string>();
    const skipped = new Set<string>();

    const noteSkip = (id: string): void => {
      if (skipped.has(id)) return;
      skipped.add(id);
      result.skippedInFlight += 1;
    };

    // Bills parked on missing master data whose slow cadence has come due rejoin
    // the queue FIRST, at their weighing position — so if one is the oldest it
    // goes straight back to the head and is tried before anything newer. If the
    // price is still missing it parks again on that attempt without having
    // blocked anything behind it.
    result.masterDataReleased += await this.store.releaseMasterDataBlocked(
      this.clock.now(),
      false,
    );

    /*
     * THE SEND LOOP DOES NOT RUN AT ALL WHILE SUBMISSION IS FORBIDDEN.
     *
     * This is what "a 403 must never retry" means in code. Everywhere else in
     * this engine a failed send goes back to pending and is tried again later,
     * because later can differ: the network returns, the office adds a price, the
     * operator signs in. A 403 has no later that this device can bring about —
     * every attempt would be an identical question to a server that has already
     * answered it definitively, and hammering it produces nothing but load and a
     * climbing attempt_count on bills that are perfectly fine.
     *
     * The bills themselves are untouched and stay queued in weighing order. The
     * moment the flag is retracted (a sign-in, or a restart) they drain exactly as
     * they would have.
     */
    for (let guard = 0; !this.sendForbidden && guard < this.batchLimit; guard += 1) {
      /*
       * STRICT HEAD-OF-LINE ORDER. The queue is read WITHOUT the backoff
       * filter, and only its head — the oldest unsent bill by weighing time —
       * may be sent. If the head cannot go, the pass stops; nothing behind it
       * is allowed to overtake.
       *
       * This is what actually fixes the observed defect. Sorting alone could
       * not: the older bill had failed twice and was sitting behind a 30s
       * backoff, so a backoff-filtered query did not return it at all, and a
       * bill weighed 73 seconds later was sent first and took the lower
       * doc_no (device: B-2569-34 weighed 22:53:38, B-2569-33 weighed
       * 22:54:51). A sort cannot order a row it cannot see.
       *
       * The cost is deliberate: one unsendable bill holds up the ones behind
       * it. That is what a queue means, and it is the right trade when the
       * numbers are legal documents.
       *
       * It CAN practically deadlock, and pretending otherwise was a real
       * mistake. A bill that fails DETERMINISTICALLY — a 5xx on that specific
       * payload, classified `unavailable` (not `rejected`, see
       * unavailable-is-not-rejected) — retries here forever and dams every bill
       * behind it, on this device, silently, while staff keep saving. The
       * engine does NOT auto-skip it: skipping the head would break ordering
       * silently, which is worse than the jam. The jam is made VISIBLE instead,
       * outside this loop — see sync/queueHealth.ts, surfaced by the UI once the
       * head has blocked past a threshold. No silent forever-stuck queue.
       */
      const queue = await this.store.listPendingOldestFirst(this.batchLimit);
      const bill = queue[0];
      if (bill === undefined) break;

      // Tried already this pass and still pending: stop rather than reach past
      // it, or the retry of an older bill would land after a newer one.
      if (attempted.has(bill.id)) break;
      // Being sent by another pass. Also a stop, not a skip.
      if (this.inFlight.has(bill.id)) {
        noteSkip(bill.id);
        break;
      }
      /*
       * The head is still in backoff, so the whole queue waits — UNLESS its
       * next_attempt_at is further out than any backoff this engine can write,
       * in which case it is not a schedule at all but a reading from a clock
       * that has since moved. See time/clockSanity.ts.
       *
       * OBSERVED ON A DEVICE. A bill bounced while the phone was ~14h fast took
       * a next_attempt_at ~14h in the future. The clock was then corrected
       * BACKWARDS, and because this `break` stops the pass at the head, that one
       * bill held the entire queue for fourteen hours while the server was
       * reachable and answering — and the strip said
       * "ยังส่งเข้าระบบไม่ได้ตอนนี้ ระบบจะส่งให้เองเมื่อเชื่อมต่อได้", because a
       * pass that attempts nothing returns before anything updates `online`.
       *
       * Deliberately a READ-time judgement. Clamping on write cannot help: the
       * stamp was legitimate when it was written and only became evidence when
       * the clock moved afterwards.
       */
      if (!scheduledInstantIsDue(bill.next_attempt_at, this.clock.now().getTime())) break;

      attempted.add(bill.id);
      this.inFlight.add(bill.id);
      try {
        // Durable claim: loses the race cleanly if another runner got here
        // first, even one in a different process that we cannot see.
        const claimed = await this.store.claimForSend(bill.id, this.clock.now());
        if (!claimed) {
          noteSkip(bill.id);
          continue;
        }
        result.attempted += 1;
        await this.sendOne(bill, result);
      } finally {
        this.inFlight.delete(bill.id);
      }
    }

    // Voids run AFTER the sends, in the same pass and on purpose. A bill
    // created offline and voided offline becomes eligible the instant its send
    // succeeds above, so it syncs, receives its doc_no, and is voided without
    // waiting for another tick. Reversing this order would leave the void owed
    // for a whole poll interval, and a crash in that window would look exactly
    // like a bill the owner cancelled but the server still shows as active.
    await this.applyVoids(result);
    return result;
  }

  /**
   * Push every void still owed to the server.
   *
   * There is no attempt cap and no terminal failure state for an unknown
   * outcome: `void_requested_at` is never cleared, so the void stays owed
   * across retries, restarts and days offline. The only things that settle it
   * are the server confirming the void, or the server refusing it outright.
   */
  private async applyVoids(result: SyncRunResult): Promise<void> {
    const owed = await this.store.listVoidsToApply(this.batchLimit);
    for (const bill of owed) {
      const key = `void:${bill.id}`;
      if (this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      try {
        const attempt = bill.void_attempts + 1;
        // A void request with no reason cannot exist: the store only ever
        // writes the two together. Defensive, and it keeps the type honest.
        const reason = bill.void_reason ?? "";

        let outcome: VoidOutcome;
        try {
          outcome = await this.transport.voidBill(bill, reason);
        } catch (err) {
          outcome = { kind: "unavailable", reason: describeError(err) };
        }

        switch (outcome.kind) {
          case "voided":
          case "already_voided":
            // "Already voided" is success. The server is in the state the owner
            // asked for, which is the entire question being answered.
            await this.store.markVoidApplied(bill.id, attempt, this.clock.now());
            result.voidsApplied += 1;
            break;

          case "rejected":
            /*
             * THE SERVER REFUSED THE VOID ITSELF — 404, 400 or 422.
             *
             * markVoidRefused, NOT markVoidAttemptFailed, and that one-word
             * change is the whole fix. markVoidAttemptFailed writes only
             * void_attempts and void_last_error; neither is in
             * listVoidsToApply's predicate, so the row stayed owed and this
             * path has no backoff column and no time gate — the device
             * re-POSTed a request that could never succeed on every pass,
             * about every four seconds, for ever.
             *
             * PERMANENT IS MEANT LITERALLY, and it is a property of what gets
             * sent rather than of the status number's reputation. The engine
             * only reaches this line for a bill that already synced
             * (listVoidsToApply requires sync_state='synced' AND doc_no), so a
             * 404 says the bill is not there for this caller and repeating
             * cannot make it appear. And the body is `reason`, read from
             * bill.void_reason, which requestVoid writes exactly once under
             * `WHERE void_requested_at IS NULL` — so it cannot change between
             * attempts. Every retry is byte-identical to the one the server
             * just refused.
             *
             * What is KEPT is what a refusal must never erase: void_requested_at
             * and the owner's own words. The office needs to know a cancellation
             * was attempted on a bill the system still shows as live. What stops
             * is only the claim that it is on its way.
             *
             * ================================================================
             * IT DOES NOT REUSE THE 403's MARKER, AND THAT IS THE PART TO READ
             * BEFORE CHANGING ANY OF THIS.
             *
             * The two look interchangeable and are not. Both write the SAME
             * COLUMN — void_refused_at — and both leave listVoidsToApply, which
             * is why the state is shared and no new column was added. What is
             * deliberately different is the CODE, and the code is not a label:
             * two separate mechanisms read it, and copying `admin_required`
             * here would have broken both, in the two directions that are
             * hardest to notice.
             *
             * ONE — THE RETRY WOULD HAVE COME BACK EVERY SHIFT.
             * clearVoidRefusals retracts refusals on every sign-in, because a
             * sign-in can change WHO IS ASKING and the next attempt may get a
             * different answer. Nothing about signing in makes a missing bill
             * exist or an invalid payload valid, so under the 403 code this
             * void would be handed back to the queue at each sign-in and hammer
             * the server again until the next one. That is WORSE THAN NEVER
             * STOPPING, not better: a line that retries forever is at least
             * visible in one sitting, while one that goes quiet and resumes
             * tomorrow morning looks like a fresh problem every time and is
             * never traced to this.
             *
             * TWO — THE OPERATOR WOULD HAVE BEEN TOLD SOMETHING FALSE.
             * billNotice routes void_refused_at through forbiddenReason, whose
             * void_bill texts are about permission. Under the 403 code the card
             * would read that this account may not cancel bills and to ask the
             * shop owner. Both halves are wrong — the account's permissions are
             * not the problem, and the shop owner cannot fix it either — and it
             * is wrong ON A BILL THE SERVER STILL HOLDS AS LIVE MONEY, sending
             * the person at the scale to the wrong human about a problem that
             * does not exist while a real one goes unreported.
             *
             * So: same state, distinct code, and both consumers know the
             * difference. See VOID_REJECTED_CODE in sync/types.ts, the
             * exclusion in SqliteLocalStore.clearVoidRefusals and its mirror in
             * the in-memory fake, and the sentence in parkedReason.
             * ================================================================
             */
            await this.store.markVoidRefused(
              bill.id,
              VOID_REJECTED_CODE,
              outcome.reason,
              attempt,
              this.clock.now(),
            );
            result.voidsRejected += 1;
            break;

          case "session_expired":
            // Still owed — void_requested_at is never cleared — and NOT counted
            // as a rejection or as an outage. The pass reports it so the UI can
            // ask for a sign-in instead of blaming the network.
            await this.store.markVoidAttemptFailed(bill.id, outcome.reason, attempt);
            result.sessionExpired += 1;
            break;

          case "forbidden":
            /*
             * THE SERVER REFUSED THE VOID BECAUSE OF WHO ASKED.
             *
             * Not markVoidAttemptFailed. That leaves the void in
             * listVoidsToApply, which has no backoff and no time gate — so the
             * refusal was re-POSTed on every pass, forever, while the card
             * promised "จะดำเนินการให้อัตโนมัติ" about a reversal that was never
             * going to happen. Both halves of that are the defect.
             *
             * What is kept: void_requested_at and the owner's reason. The owner
             * asked, in their own words, and that must not be erased by a
             * refusal — the office needs to know a cancellation was attempted on
             * a bill the system still shows as live. What changes is only the
             * claim that it is on its way.
             */
            await this.store.markVoidRefused(
              bill.id,
              outcome.code,
              outcome.reason,
              attempt,
              this.clock.now(),
            );
            result.voidsForbidden += 1;
            break;

          case "unavailable":
            await this.store.markVoidAttemptFailed(bill.id, outcome.reason, attempt);
            result.voidsRetryable += 1;
            break;

          default: {
            const never: never = outcome;
            throw new Error(`unhandled void outcome: ${JSON.stringify(never)}`);
          }
        }
      } finally {
        this.inFlight.delete(key);
      }
    }
  }

  /**
   * Repeat passes until nothing is pending or maxPasses is spent. Between
   * passes it sleeps on the injected Clock, so tests advance time instantly.
   */
  async runUntilQuiescent(maxPasses = 200, pollMs = 250): Promise<SyncRunResult> {
    const total = emptyResult();
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const r = await this.runOnce();
      total.attempted += r.attempted;
      total.synced += r.synced;
      total.retryable += r.retryable;
      total.rejected += r.rejected;
      total.skippedInFlight += r.skippedInFlight;
      total.voidsApplied += r.voidsApplied;
      total.voidsRetryable += r.voidsRetryable;
      total.voidsRejected += r.voidsRejected;
      total.backoffsCleared += r.backoffsCleared;
      total.masterDataBlocked += r.masterDataBlocked;
      total.masterDataReleased += r.masterDataReleased;
      total.sessionExpired += r.sessionExpired;
      total.forbidden += r.forbidden;
      total.voidsForbidden += r.voidsForbidden;

      /*
       * A REFUSAL ABOUT WHO IS ASKING is not progress this loop can make either,
       * and for the send half it would not even terminate: the bills stay
       * pending, so the quiescence test below never clears while the send loop is
       * gated off. Returning here reports the refusal to the caller in the same
       * breath as the session case, which is the caller that has a screen.
       */
      if (r.forbidden > 0 || r.voidsForbidden > 0) return total;

      // A session that has ended is not progress this loop can make. No number
      // of passes conjures a token, so spinning to maxPasses would only inflate
      // attempt_count and the backoff on every queued bill before the operator
      // has even seen the sign-in prompt. Same reasoning as the parked bills
      // below, and the caller learns why from the returned totals.
      if (r.sessionExpired > 0) return total;

      // Quiescent means nothing left to SEND and nothing left to void. Testing
      // only `pending` would return while a void was still owed, and a proof
      // built on that would assert the final state before it was final.
      //
      // listPendingOldestFirst, not listByState('pending'): a bill parked on
      // missing master data is still `pending` but is NOT work this loop can
      // make progress on — no number of passes will conjure a price. Counting it
      // would spin every caller to maxPasses and call a settled queue busy.
      const sendable = await this.store.listPendingOldestFirst(1);
      const owedVoids = await this.store.listVoidsToApply(1);
      if (sendable.length === 0 && owedVoids.length === 0) return total;
      await this.clock.sleep(pollMs);
    }
    return total;
  }

  private async sendOne(bill: LocalBill, result: SyncRunResult): Promise<void> {
    const attempt = bill.attempt_count + 1;

    let outcome: SendOutcome;
    try {
      outcome = await this.transport.sendBill(bill);
    } catch (err) {
      // The send threw. The server may have committed the bill before the
      // connection died — we cannot know. Unknown is NOT failure: go back to
      // pending and retry with the same idempotency key. A throw means we got no
      // answer at all, so it is `reachable: false` (offline-shaped), never poison.
      outcome = { kind: "unavailable", reason: describeError(err), reachable: false };
    }

    switch (outcome.kind) {
      case "accepted":
      case "duplicate":
        // "Already exists" is success. It means our key won a previous race or
        // a lost response actually landed — the bill IS on the server.
        await this.store.markSynced(bill.id, outcome.doc_no, attempt, this.clock.now());
        result.synced += 1;
        // This send PROVED the server is reachable, so every other pending
        // bill's backoff was computed against a stale view of the world. Clear
        // it, or an older bill that failed a few times stays invisible to
        // listReadyToSend while newer bills sail past it and take lower
        // doc_no values — observed on the device as B-2569-34 (weighed
        // 22:53:38) arriving after B-2569-33 (weighed 22:54:51).
        result.backoffsCleared += await this.store.clearBackoffForPending(this.clock.now());
        return;

      case "rejected":
        // The server saw the bill and refused it PERMANENTLY: the payload itself
        // is wrong and no action by anyone makes it valid. It stops here —
        // visibly failed, with the reason kept for the UI.
        await this.store.markFailed(bill.id, outcome.reason, attempt, this.clock.now());
        result.rejected += 1;
        return;

      case "rejected_resolvable": {
        // The server refused it, but said the cause is master data that has not
        // been set up. That BECOMES valid when the office adds the price, so
        // marking it `failed` would strand a load that is already in the pile and
        // force a re-weigh of scrap that no longer exists as a separate load.
        //
        // It is parked instead: still pending, still owed, out of the
        // head-of-line queue so it blocks nothing, and visible to the operator
        // with the server's own reason code.
        const now = this.clock.now();
        await this.store.markMasterDataMissing(
          bill.id,
          outcome.code,
          outcome.reason,
          attempt,
          new Date(now.getTime() + this.masterDataRetryMs),
          now,
        );
        result.masterDataBlocked += 1;
        return;
      }

      case "session_expired": {
        // The session ended. This is NOT the bill's fault and NOT an outage:
        // the server answered, promptly and correctly, that we are no longer
        // signed in. So the bill goes back to pending untouched and the POISON
        // counters are cleared by markSessionExpired — with three bills queued
        // the old classification (unavailable, reachable: true) counted these
        // toward POISON_ALARM_ATTEMPTS and told the yard to call support.
        //
        // The backoff is the ordinary one. It is cleared wholesale by
        // resumeAfterSignIn the moment the operator signs in, so a queue does
        // not sit out a 30s delay that was never about the network.
        const now = this.clock.now();
        const next = new Date(now.getTime() + this.backoffFor(attempt));
        await this.store.markSessionExpired(bill.id, outcome.reason, attempt, next, now);
        result.sessionExpired += 1;
        return;
      }

      case "forbidden": {
        /*
         * THIS ACCOUNT MAY NOT SUBMIT BILLS. Not this bill — every bill.
         *
         * The bill goes back to pending untouched and the poison counters are
         * cleared, for the same reason markSessionExpired clears them: a signal
         * meaning "the reachable server keeps refusing THIS BILL" must not be fed
         * by a condition that is true of every bill (the 401 lesson's rule 3).
         * Left as `unavailable, reachable: true` — which is what the transport
         * used to return for a 403 — this drove server_error_attempts to
         * POISON_ALARM_ATTEMPTS and sent the yard to ring support about a
         * permission.
         *
         * Then the loop stops, and stays stopped: the flag is what makes "never
         * retries" true rather than "retries a bit slower".
         */
        await this.store.markSendForbidden(
          bill.id,
          outcome.reason,
          attempt,
          this.clock.now(),
        );
        this.sendForbidden = true;
        result.forbidden += 1;
        return;
      }

      case "unavailable": {
        // No attempt cap on purpose: a yard can be offline for days, and a bill
        // marked `failed` for being offline would be a lie. It stays pending
        // with attempt_count and last_error visible.
        const now = this.clock.now();
        const next = new Date(now.getTime() + this.backoffFor(attempt));
        // `now` stamps first_attempt_at on the FIRST bounce (COALESCE in the
        // store). `outcome.reachable` additionally drives first_server_error_at:
        // a server-answered failure runs the poison clock, a transport failure
        // resets it — that is how the UI tells a poisoned head from a plain
        // outage (sync/queueHealth.ts).
        await this.store.markPendingAgain(
          bill.id,
          outcome.reason,
          attempt,
          next,
          now,
          outcome.reachable,
        );
        result.retryable += 1;
        return;
      }

      default: {
        const never: never = outcome;
        throw new Error(`unhandled send outcome: ${JSON.stringify(never)}`);
      }
    }
  }

  private backoffFor(attempt: number): number {
    const raw = this.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(raw, this.backoffMaxMs);
  }
}

/**
 * Queue-health assessment. PURE TypeScript — no store, no clock, no I/O. Given a
 * snapshot of the pending send queue and the current time, it decides whether
 * the queue is jammed behind an unsendable head, and — the point of this module
 * — whether that jam is a POISONED bill (call support) or merely an OFFLINE
 * backlog (wait it out), because staff respond to the two differently.
 *
 * WHY THIS EXISTS. Under strict head-of-line order (see
 * [[doc-no-is-arrival-order-not-event-time]]) only the oldest pending bill is
 * ever sent; nothing behind it may overtake. A bill that fails DETERMINISTICALLY
 * — a 5xx on that specific payload, classified `unavailable`, not `rejected` —
 * retries forever and dams every bill behind it, silently. Auto-skipping the
 * head would hide the jam and break ordering at once, so the answer is to keep
 * the ordering and make the jam VISIBLE. This module is the judgement the UI
 * renders. It never sends or skips anything; it only describes.
 *
 * OFFLINE vs POISONED — the distinction this module draws:
 *
 *   A backlog piling up while the whole network is down is normal and honest: it
 *   must stay CALM AMBER even for a long time, or the alarm cries wolf every
 *   time a yard loses signal and staff learn to ignore it. A backlog piling up
 *   because one bill makes the REACHABLE server fail every time is a real fault
 *   that only support can clear: it must go LOUD RED.
 *
 *   The signal that separates them is NOT time and NOT attempt count — a long
 *   outage and a poison pill both bounce many times over many minutes, so any
 *   time/count threshold on its own would flag the honest outage too. The
 *   reliable signal is whether the SERVER ANSWERED: a bounce carrying an HTTP
 *   status proves the network is usable and the server still refused (poison); a
 *   transport-level bounce proves nothing got through (offline). The engine
 *   captures that per attempt (SendOutcome.reachable) and the store carries it as
 *   first_server_error_at — non-null iff the reachable server has been refusing
 *   the head continuously. This module only reads it.
 */
import type { QueueSnapshot } from "./types.js";

/**
 * TUNING KNOBS. Both the threshold below and the reachability signal it gates on
 * are GUESSES, to be tuned against a real yard's network once we have one — do
 * not treat either as measured.
 *
 * POISON_ALARM_MS — how long the REACHABLE server must keep refusing the head
 * before the loud red alarm fires. Measured from first_server_error_at, so it
 * does NOT count time merely spent offline. Long enough to ride out a brief
 * server hiccup or deploy blip (which clears itself the moment the bill finally
 * sends); short enough that a genuinely poisoned bill surfaces before a real
 * backlog piles up. The offline/amber state deliberately has NO timer at all —
 * it is honest for as long as the network is down.
 */
export const POISON_ALARM_MS = 90_000;

/**
 * POISON_ALARM_ATTEMPTS — the SECOND trigger for the same red alarm: this many
 * consecutive failures against a REACHABLE server escalate the head regardless of
 * how little wall-clock time has passed.
 *
 * Why a count as well as a clock. POISON_ALARM_MS assumes a poisoned bill takes
 * time to become obvious, which is only true while the backoff is short. A server
 * that answers instantly, a device that has been retrying since before the app
 * restarted, or a backoff already capped at 30s can all burn through many
 * refusals inside one threshold window — and every one of those refusals is
 * direct evidence the server will not take this bill. Waiting out a timer while
 * holding that evidence is just a slower alarm.
 *
 * READ THIS BEFORE CHANGING IT. Attempt count is used here ONLY to escalate a
 * head that is ALREADY classified poisoned. It plays no part in deciding whether
 * a jam is offline or poisoned — that remains solely the reachability signal, per
 * lessons/queue-jam-must-be-visible.md, which is explicit that neither time nor
 * attempt count can separate a long outage from a poison pill. The count is safe
 * here precisely because server_error_attempts RESETS on any transport-level
 * bounce: an offline yard cannot accumulate it, so this cannot cry wolf on a dead
 * spot. Using attempt_count instead would break exactly that property.
 *
 * A guess like the threshold above, to be tuned against a real yard.
 */
export const POISON_ALARM_ATTEMPTS = 5;

export interface QueueHealth {
  /**
   * The head has failed at least once AND there are bills waiting behind it.
   * True for BOTH an offline backlog and a poisoned head — the amber-level
   * "something is stuck" signal, before we know which of the two it is.
   */
  blocking: boolean;
  /**
   * `blocking` and the head's last bounce was transport-level: the server never
   * answered. A plain outage — stays calm amber no matter how long. Mutually
   * exclusive with `poisoned`.
   */
  offline: boolean;
  /**
   * `blocking` and the reachable server is refusing the head: it answered, the
   * network works, the bill still will not go. A real fault — goes red once it
   * persists. Mutually exclusive with `offline`.
   */
  poisoned: boolean;
  /**
   * `poisoned` AND it has persisted past POISON_ALARM_MS. THIS is the state the
   * status strip shouts about and the only one that marks a blocker; below it,
   * and for ANY offline backlog however long, the calmer message is the honest
   * one.
   */
  alarm: boolean;
  /** The blocking bill's id, but only once `alarm` holds. */
  blockerId: string | null;
  /** Bills stuck behind the head. What "holding up N" reports. */
  behind: number;
  /** Failed attempts on the head so far. */
  attempts: number;
  /** Total time the head has been unable to send, any reason, in ms. Amber context. */
  blockedForMs: number;
  /**
   * Time the REACHABLE server has been refusing the head, in ms. 0 whenever the
   * head is offline (server not answering). This is what the red alarm reports —
   * "failing for N minutes even though the server is reachable".
   */
  poisonedForMs: number;
  /**
   * Consecutive failures against a reachable server. 0 whenever the head is
   * offline. The count that can raise `alarm` on its own once it reaches
   * POISON_ALARM_ATTEMPTS.
   */
  serverErrorAttempts: number;
  /**
   * Bills parked waiting on master data. NOT part of `blocking`/`behind`: they
   * are not stuck in the queue, they have left it, and no network event will
   * clear them — only the office adding the price, or the operator retrying.
   * Surfaced here so the UI has one source for the whole queue picture.
   */
  masterDataBlocked: number;
  last_error: string | null;
}

const CLEAR: QueueHealth = {
  blocking: false,
  offline: false,
  poisoned: false,
  alarm: false,
  blockerId: null,
  behind: 0,
  attempts: 0,
  blockedForMs: 0,
  poisonedForMs: 0,
  serverErrorAttempts: 0,
  masterDataBlocked: 0,
  last_error: null,
};

/**
 * Assess a queue snapshot.
 *
 * `blocking` requires the head to have ACTUALLY bounced (attempts > 0), not
 * merely to be sitting there unsent — a queue that has not had a chance to try
 * is not jammed, it is new. Whether a jam is `offline` or `poisoned` is read
 * straight off first_server_error_at: non-null means the last bounce reached the
 * server (poison), null means it did not (offline).
 *
 * The red `alarm` then fires on EITHER of two triggers, both gated behind
 * `poisoned`: the refusal has persisted past thresholdMs (measured from
 * first_server_error_at, so time spent offline never counts), OR the reachable
 * server has now refused this bill thresholdAttempts times in a row. Two
 * triggers because a poisoned bill can become obvious either slowly or quickly,
 * and waiting out a clock while holding N explicit refusals is just a later
 * alarm. Neither trigger can fire for an offline head.
 */
export function assessQueue(
  snap: QueueSnapshot,
  now: Date,
  thresholdMs: number = POISON_ALARM_MS,
  thresholdAttempts: number = POISON_ALARM_ATTEMPTS,
): QueueHealth {
  const head = snap.head;
  // No sendable head: the queue is clear as far as the NETWORK is concerned, but
  // parked bills must still be reported or they would vanish from the UI the
  // moment they were the only thing left.
  if (head === null) return { ...CLEAR, masterDataBlocked: snap.masterDataBlockedCount };

  const behind = Math.max(0, snap.pendingCount - 1);
  const attempts = head.attempts;
  const blockedForMs =
    head.first_attempt_at === null
      ? 0
      : Math.max(0, now.getTime() - new Date(head.first_attempt_at).getTime());
  const poisonedForMs =
    head.first_server_error_at === null
      ? 0
      : Math.max(0, now.getTime() - new Date(head.first_server_error_at).getTime());

  const blocking = attempts > 0 && behind > 0;
  // Reachable-and-refusing right now iff the poison clock is running: it is
  // stamped on a server-answered bounce and reset by a transport-level one, so
  // its mere presence encodes "the last failure reached the server".
  const serverRefusing = head.first_server_error_at !== null;
  const poisoned = blocking && serverRefusing;
  const offline = blocking && !serverRefusing;
  // EITHER trigger escalates, and both are gated behind `poisoned` — so an
  // offline backlog can reach neither, however long it lasts or however many
  // times it has bounced. The count catches a server that refuses fast; the
  // clock catches one that refuses slowly. Whichever arrives first is the one
  // that had the evidence first.
  const serverErrorAttempts = head.server_error_attempts;
  const alarm =
    poisoned &&
    (poisonedForMs >= thresholdMs || serverErrorAttempts >= thresholdAttempts);

  return {
    blocking,
    offline,
    poisoned,
    alarm,
    blockerId: alarm ? head.id : null,
    behind,
    attempts,
    blockedForMs,
    poisonedForMs,
    serverErrorAttempts,
    masterDataBlocked: snap.masterDataBlockedCount,
    last_error: head.last_error,
  };
}

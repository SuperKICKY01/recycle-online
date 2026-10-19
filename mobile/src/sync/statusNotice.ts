/**
 * What the always-visible status strip says. PURE TypeScript — no React Native,
 * no Expo, no node — so the headless proof exercises exactly what the yard sees.
 *
 * WHY IT MOVED OUT OF app/StatusStrip.tsx. The same reason billNotice moved out
 * of the bill card: files under app/ are unreachable by the proofs
 * (tsconfig.node.json has rootDir "src"), so every sentence living there was
 * outside the proven surface entirely. That is not a weak test, it is an absent
 * one — and it is how the strip came to tell an operator whose session had
 * expired that they were ออฟไลน์, with no assertion anywhere that could have
 * gone red. lessons/correct-classification-can-still-render-as-an-error.md.
 *
 * The strip renders whatever this returns and decides nothing itself.
 *
 * ONE ORDERED LIST, and the order is the design. Several of these can be true at
 * once, and the strip has one line, so what it picks is a claim about what the
 * operator should do FIRST.
 */
import { parkedSummary } from "./parkedReason.js";
import type { AccountState, SessionState } from "./parkedReason.js";
import type { OutboxKind, OwedByKind } from "./outbox.js";

export type StatusTone = "bad" | "warn" | "busy" | "good" | "idle";

/**
 * A button on the strip. The KIND selects the handler and the LABEL comes with
 * it, so the view cannot pair "ส่งอีกครั้ง" with the sign-in handler or invent a
 * label for an action that does something else.
 */
export type StatusAction =
  | { kind: "retry_master_data"; label: string }
  | { kind: "sign_in"; label: string }
  /** Re-read /whoami and resume what the grants allow again (3b) — never a sign-in. */
  | { kind: "recheck_grants"; label: string }
  | null;

export interface StatusNotice {
  tone: StatusTone;
  message: string;
  action: StatusAction;
}

export interface StatusInput {
  /**
   * THE BUILD IS TOO OLD (426), device-global. Outranks everything, session
   * included: a 426 refuses even the sign-in a dead session would ask for, so
   * "update the app" is the one action. It is NOT an error — the queued bills are
   * safe and send after the update. Sticky in App until the process restarts on
   * an updated bundle.
   */
  appOutdated: boolean;
  /** Can this device act as someone at all? Outranks everything below. */
  session: SessionState;
  /**
   * What the server has refused this ACCOUNT. Device-global, derived from the
   * last answer — never stored, never per bill.
   */
  account: AccountState;
  /**
   * Bills whose VOID the server refused (403). Counted rather than flagged
   * because each one is a separate purchase the yard believes is cancelled and
   * the system still holds as live money, and the number is the size of that
   * disagreement.
   */
  voidsRefused: number;
  /** null = nothing has been attempted since launch, so unknown, not assumed good. */
  online: boolean | null;
  /**
   * THIS PERSON'S bills waiting on a CONNECTION.
   *
   * EXCLUDES: every other account's bills, bills with an unknown owner (the two
   * fields below carry those), and this person's bills parked on missing master
   * data (`waitingOnMasterData` carries those). INCLUDES: nothing else — it is
   * `UnsentBreakdown.mine`, and it goes down on its own when the network returns.
   *
   * ---------------------------------------------------------------------------
   * THE PREVIOUS WORDING HERE WAS FALSE, AND IS RECORDED RATHER THAN REPLACED
   * ---------------------------------------------------------------------------
   * It read, in full: "Bills queued to send (pending + syncing). Excludes parked
   * ones." The second sentence was untrue of every value this field ever
   * received. `App.tsx` fed it `listByState('pending') + listByState('syncing')`,
   * which excluded neither parked bills nor other accounts' — so the field
   * documented a filter its caller did not apply, and the operator read a number
   * including bills they did not own, could not send, and could not clear by any
   * action. The sign-out refusal read the same number.
   *
   * IT STOOD BECAUSE NOTHING CHECKS A COMMENT AGAINST THE CODE BENEATH IT. Both
   * typechecks passed, every proof was green, and the sentence was accurate about
   * the value the field's AUTHOR intended rather than the one its caller passed.
   * A wrong comment on a correct field is invisible to every instrument this
   * repository owns; the only thing that finds it is somebody reading the caller
   * and the callee in the same pass, which is what P1.7 step 7 forced.
   *
   * So the rule this leaves behind: a field whose docstring states a FILTER is
   * making a claim about its CALLER, and nothing verifies it. State what the
   * field means and let the type carry the rest — or give the filtered value its
   * own name, which is what `UnsentBreakdown` now does.
   *
   * Not pinned to a sha: this ships in the commit that corrects it, and HEAD
   * would name the commit that still carries the false wording — CLAUDE.md
   * section Conventions "PIN A CLAIM TO A COMMIT". Written 2026-08-11.
   */
  pending: number;
  /**
   * Bills belonging to a KNOWN person who is not signed in here. Waits on that
   * PERSON, never on the network — see UnsentBreakdown.
   */
  parkedForAnother: number;
  /**
   * Bills whose owner is UNKNOWN. Waits on nobody: no sign-in releases them,
   * because null matches no identity. Separate from the line above because the
   * two need opposite instructions.
   */
  parkedUnknownOwner: number;
  /** Terminally failed bills — the server refused them and never will accept them. */
  failed: number;
  /**
   * Set ONLY when one bill is POISONED: the reachable server keeps refusing the
   * head past the alarm threshold, holding up the bills behind it.
   */
  blocked: { behind: number; forMs: number; attempts: number } | null;
  waitingOnMasterData: number;
  /** The server's `code` per parked bill — codes only, never a response body. */
  masterDataCodes: readonly string[];
  /**
   * EVERY KIND OF WORK THE DEVICE OWES, straight off the registry.
   *
   * REQUIRED, never optional with a zero map as its default — an optional field
   * would leave every existing call site compiling clean while the strip went on
   * saying `ส่งครบแล้ว` over an owed seller, which is precisely the
   * defaulted-parameter failure this file's neighbours have been repaired for
   * twice (`session` on `SignOutCardInput`, `action` on `forbiddenReason`).
   * Making it required turned every construction site in the tree into a
   * compile error, and that is how the sweep is known to be complete rather
   * than remembered.
   *
   * IT OVERLAPS `pending` AND THAT IS DELIBERATE, so read the pair carefully.
   * `pending` is `UnsentBreakdown.mine` — MY bills waiting on a CONNECTION —
   * and it, `waitingOnMasterData` and `failed` are the three lines that already
   * speak for the bill kinds above. This map is the whole debt, and it is read
   * by ONE branch, low down, for the kinds no line above has spoken for. Which
   * kinds those are is written out in OWED_STRIP_LINE, not decided here.
   */
  owed: OwedByKind;
}

/**
 * WHAT THE STRIP SAYS ABOUT EACH KIND'S OWED WORK — `null` where a branch above
 * already says it. TOTAL over `OutboxKind`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TABLE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * The strip's ordered branch was written when every unit of owed work was a
 * bill, so `pending`, `waitingOnMasterData` and `failed` between them covered
 * everything the device could owe, and the tail branches could truthfully say
 * `ส่งครบแล้ว`. `bill_void` was already outside that (a device owing a
 * cancellation read "sent everything" — recorded, and left, when the outbox
 * landed), and `seller_create` widened the same gap rather than opening a new
 * one. The tail branches now state something FALSE, and this table is the
 * minimum that stops them.
 *
 * `null` IS A CLAIM ABOUT THE BRANCHES ABOVE, not an omission, and it is the
 * entry a later reader must not copy blindly: it says *this kind's owed work is
 * already on the strip somewhere*, and it is only true of `bill_send` because
 * three separate inputs carry those rows. A fourth kind gets a compile error
 * here and has to answer the same question.
 *
 * NO TOTAL IS RENDERED, for the reason `OwedByKind` gives: it counts units of
 * WORK, and one bill can be owed twice at once.
 */
const OWED_STRIP_LINE: { readonly [K in OutboxKind]: ((n: number) => string) | null } = {
  // Already said, three times over and more precisely than a debt count could:
  // `pending` (waiting on a connection), `waitingOnMasterData` (waiting on the
  // office, with its own retry button) and `failed` (waiting on nobody). Adding
  // a fourth sentence about the same rows would be the double-count the strip's
  // own breakdown exists to prevent.
  bill_send: null,
  bill_void: (n) => `รอแจ้งยกเลิกบิล ${String(n)} ใบ`,
  seller_create: (n) => `รอส่งผู้ขายที่เพิ่มใหม่ ${String(n)} ราย`,
};

/**
 * The owed work no line above speaks for, in registry order.
 *
 * ENUMERATES THE MAP'S OWN KEYS. Written as
 * `owed.bill_void + owed.seller_create` it would compile for ever and silently
 * stop covering the next kind, which is this repository's oldest failure shape
 * and was measured at five sites one commit ago.
 */
function unspokenOwed(owed: OwedByKind): readonly string[] {
  const parts: string[] = [];
  for (const kind of Object.keys(owed) as OutboxKind[]) {
    const line = OWED_STRIP_LINE[kind];
    if (line !== null && owed[kind] > 0) parts.push(line(owed[kind]));
  }
  return parts;
}

const RECHECK_GRANTS: StatusAction = { kind: "recheck_grants", label: "ลองอีกครั้ง" };

/**
 * ONE HANDLER PER ACTION KIND, AND THE MAP IS TOTAL. The strip used to choose with
 * `kind === "sign_in" ? onSignIn : onRetryMasterData`, which routed every OTHER kind
 * to the master-data retry — so adding `recheck_grants` would have wired ลองอีกครั้ง to
 * the wrong action with nothing going red. Typed over the kind union, a kind without
 * a handler is now a compile error, and the routing lives where a proof can see it.
 */
export type StatusActionKind = NonNullable<StatusAction>["kind"];
export type StatusActionHandlers = { readonly [K in StatusActionKind]: () => void };

export function statusActionHandler(action: StatusAction, handlers: StatusActionHandlers): (() => void) | null {
  return action === null ? null : handlers[action.kind];
}

export function statusNotice(s: StatusInput): StatusNotice {
  /*
   * 0. THE BUILD IS TOO OLD (426) — ABOVE THE SESSION ITSELF.
   *
   * A 426 refuses every request, the sign-in a dead session would ask for
   * included, so no message below is an action the operator can take until the
   * app is updated. It is deliberately NOT an error: amber (a waiting state, like
   * an outage or parking), and NO button — the update comes from outside the app,
   * and WHERE from is P1.11's business, so none is invented here. It is not
   * recoverable by retry, and the reassurance is that the queued bills are safe.
   *
   * Sticky: App sets it on the first 426 and never clears it, because nothing on
   * this device makes an old build new — only an update, which is a new process.
   */
  if (s.appOutdated) {
    const tail =
      s.pending > 0
        ? ` บิล ${String(s.pending)} ใบยังอยู่ครบ จะส่งให้เองหลังอัปเดต`
        : " บิลที่บันทึกไว้ยังอยู่ครบ";
    return {
      tone: "warn",
      message: "แอปเวอร์ชันนี้เก่าเกินไป — ต้องอัปเดตก่อนใช้งานต่อ" + tail,
      action: null,
    };
  }

  /*
   * 1. NO USABLE SESSION — first, above the poison alarm itself.
   *
   * Nothing else on this list can make progress until someone signs in, so any
   * other message would be advice the operator cannot act on. It specifically
   * outranks `blocked` because a queue that is jammed with no session is not
   * evidence of a server fault, and "ติดต่อฝ่ายสนับสนุน" would send the yard to
   * ring support about an expired token. (It cannot normally BE set during an
   * expiry any more — markSessionExpired clears the poison columns — but ranking
   * is where that belief is stated rather than assumed.)
   *
   * Amber, not red: like an outage and like parking, this is a WAITING state
   * with a known fix, not a fault. And it carries the fix as a button, because a
   * message that names an action the operator cannot reach is only half a
   * message — the app's own login button renders on `token === null`, which is
   * exactly false when a token has expired.
   */
  if (s.session !== "active") {
    const head =
      s.session === "expired"
        ? "หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่"
        : "ยังไม่ได้เข้าสู่ระบบ";
    const tail =
      s.pending > 0
        ? ` บิล ${String(s.pending)} ใบยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบ`
        : " บันทึกบิลได้ตามปกติ";
    return {
      tone: "warn",
      message: head + tail,
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }

  /*
   * 2. A POISONED HEAD. A bill the REACHABLE server keeps refusing is damming
   * every bill behind it. Say exactly that — including "even though the server
   * is reachable", so staff know this is not "wait for signal" but "call
   * support" — with how long and how many, no jargon.
   */
  if (s.blocked !== null) {
    // Report the REFUSAL COUNT, not just elapsed minutes. The alarm can be
    // raised by the count alone, and in that case the elapsed time may still be
    // well under a minute — rounding it up to "1 นาที" would understate a bill
    // the server has already refused five times.
    const mins = Math.round(s.blocked.forMs / 60_000);
    const howLong = mins >= 1 ? ` นาน ${String(mins)} นาที` : "";
    return {
      tone: "bad",
      message:
        `บิล 1 ใบส่งไม่ผ่าน ${String(s.blocked.attempts)} ครั้งติด${howLong}` +
        ` ทั้งที่เชื่อมต่อเซิร์ฟเวอร์ได้` +
        ` — ค้างหน้าคิวจนอีก ${String(s.blocked.behind)} ใบส่งไม่ได้ ต้องติดต่อฝ่ายสนับสนุน`,
      action: null,
    };
  }

  /*
   * 3. THE SERVER HAS REFUSED THIS ACCOUNT. Below the poison alarm, above
   * everything that amounts to "wait".
   *
   * WHY NOT HIGHER. The alarm above means the queue is dammed and no money is
   * moving at all; that stays first. And a permission refusal cannot be mistaken
   * for it, because markSendForbidden clears the poison columns — so if both
   * were somehow true, the jam is the bigger fact and this one is still on the
   * card.
   *
   * WHY NOT LOWER, and this is the whole argument. Every message below is
   * something that resolves itself or is already in someone's hands: parked bills
   * go the moment the office adds a price, an outage ends, a queue drains. This
   * one resolves NEVER without a person, and unlike them it is not about a set of
   * bills — it is about what this phone may do, so it will keep producing new
   * instances every time anyone taps the button. It specifically outranks
   * `online === false`, which would say "จะส่งให้เองเมื่อเน็ตกลับมา": the network
   * is fine, waiting is not a strategy, and that sentence would send the yard to
   * check the signal over a permission.
   *
   * Red, and NOT the support alarm. The colour is right — this is a real
   * disagreement about money, not a waiting state — but the sentence names the
   * shop owner, because support cannot grant a role and a phone number here would
   * cost someone a call to the wrong person. Above all it must never invite a
   * sign-in — the same user would come back with the same role, which is a loop
   * with a person in it.
   *
   * ONE BUTTON SINCE 3b (ADVISOR-DECIDED 2026-10-17): ลองอีกครั้ง, which re-reads
   * /whoami and resumes exactly what the grants allow again (src/session/
   * grantRecheck.ts) — the device CAN perform that, so it is no longer an action
   * dressed as one it can. It was absent while the only way back was a sign-in.
   * The app coming to the foreground does the same re-read. The sentence says the
   * order: the owner restores the permission, then the button.
   */
  if (s.account === "submit_refused" || s.voidsRefused > 0) {
    // Both facts can hold at once; neither may hide the other. The submit
    // refusal leads because it is still accumulating — every bill weighed from
    // now on joins it — while the refused voids are a fixed set already recorded.
    const refusedVoids =
      s.voidsRefused > 0 ? ` และยกเลิกบิลไม่สำเร็จ ${String(s.voidsRefused)} ใบ` : "";
    if (s.account === "submit_refused") {
      const held =
        s.pending > 0
          ? ` บิล ${String(s.pending)} ใบอยู่ในเครื่อง รอส่ง`
          : "";
      return {
        tone: "bad",
        message:
          `บัญชีนี้ไม่มีสิทธิ์ส่งบิลเข้าระบบ${held}${refusedVoids}` +
          " — แจ้งเจ้าของร้านให้คืนสิทธิ์ แล้วกด ลองอีกครั้ง",
        action: RECHECK_GRANTS,
      };
    }
    return {
      tone: "bad",
      message:
        `ยกเลิกบิลไม่สำเร็จ ${String(s.voidsRefused)} ใบ` +
        " — บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล บิลยังอยู่ในระบบตามเดิม แจ้งเจ้าของร้านให้คืนสิทธิ์ แล้วกด ลองอีกครั้ง",
      action: RECHECK_GRANTS,
    };
  }

  /*
   * 4. WAITING ON THE OFFICE. Ranked above `failed` on purpose: this one is
   * time-sensitive and cheap to fix. Staff are often still at the yard and the
   * office can act in seconds — whereas a bill the server has refused outright
   * needs someone to sit down with it. Say what to do, not what went wrong.
   *
   * Amber, not red: parking is a WAITING state. The wording comes from the
   * server's code (parkedSummary), never hardcoded to the price case, which was
   * wrong for every bill parked on a grade-less seller.
   */
  if (s.waitingOnMasterData > 0) {
    return {
      tone: "warn",
      message: `${parkedSummary(s.waitingOnMasterData, s.masterDataCodes)} — ไม่ต้องชั่งใหม่`,
      action: { kind: "retry_master_data", label: "ส่งอีกครั้ง" },
    };
  }

  /*
   * 5. TERMINALLY FAILED BILLS. This used to read "ส่งไม่สำเร็จ N ใบ — ต้องแก้ไข",
   * which names no actor and no action: there is nothing on this device that can
   * "fix" a bill the server has permanently refused, and the card was
   * simultaneously offering to cancel it. What is actually true is that the
   * server has NO RECORD of these purchases while the cash has already been
   * paid, so this is office work and it is urgent.
   */
  if (s.failed > 0) {
    return {
      tone: "bad",
      message: `ระบบไม่รับบิล ${String(s.failed)} ใบ — ระบบไม่มีบิลเหล่านี้ ต้องแจ้งสำนักงาน`,
      action: null,
    };
  }

  if (s.online === false) {
    return {
      tone: "warn",
      message:
        s.pending > 0
          ? `ออฟไลน์ — รอส่ง ${String(s.pending)} ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
          : "ออฟไลน์ — บันทึกได้ตามปกติ",
      action: null,
    };
  }

  if (s.pending > 0) {
    return { tone: "busy", message: `กำลังส่ง ${String(s.pending)} ใบ`, action: null };
  }

  /*
   * OWED WORK NO LINE ABOVE HAS SPOKEN FOR — the non-bill kinds.
   *
   * WHY IT IS HERE AND NOT HIGHER. Every branch above is either a fact that
   * outranks it (no session, a dammed queue, a refused account) or a MORE
   * SPECIFIC statement about the same rows (the office, the failed bills, the
   * outage, this person's own queue). Placed above any of them it would displace
   * a message the operator can act on with one they cannot.
   *
   * WHY IT IS HERE AND NOT LOWER, WHICH IS THE WHOLE POINT OF THE BRANCH. Every
   * branch BELOW claims the work is done — `งานของคุณส่งครบแล้ว`, `ส่งครบแล้ว` —
   * and that is a false sentence on a device that owes a seller create or a
   * cancellation. It was true for as long as the only kind was `bill_send`. It
   * stopped being true at `1d7f638` and nothing went red, because the sentence
   * quantifies over the work and names no kind
   * (`ROADMAP.md § P1.8` "The seller kind is the FIRST kind whose rows are not in `local_bills`").
   *
   * `busy`, THE SAME TONE AS `กำลังส่ง`. This is work in flight that drains
   * itself the moment the device reaches the server; it needs nobody, so it is
   * not amber, and a warning that fires routinely is a warning people stop
   * reading. And no action: there is nothing to press, exactly as with the
   * sending line above it.
   *
   * IT DOES NOT OUTRANK `ออฟไลน์`, and that is deliberate rather than an
   * oversight. `ออฟไลน์ — บันทึกได้ตามปกติ` states nothing false about owed work
   * and is the bigger fact for somebody standing at the weighbridge; changing it
   * would be redrawing a screen this phase is not redrawing.
   */
  const unspoken = unspokenOwed(s.owed);
  if (unspoken.length > 0) {
    return { tone: "busy", message: unspoken.join(" · "), action: null };
  }

  /*
   * NOTHING OF THIS PERSON'S IS WAITING — BUT SOMEBODY ELSE'S IS.
   *
   * Placed BELOW every branch about this operator's own work, and that ordering
   * is the content: their own queue, their own failures and their own session
   * all outrank a row they cannot touch. It surfaces only once there is nothing
   * of theirs left to say, so it can never displace a message they can act on.
   *
   * AND IT IS NOT AN ALARM. `idle`, the same tone as "พร้อมใช้งาน" — nothing is
   * wrong, nothing is stuck for them, and the yard is working. A warn tone here
   * would put an amber strip on the screen all day over somebody else's bill,
   * which is how an operator learns to stop reading the strip.
   *
   * THE TWO SENTENCES NAME DIFFERENT WAITS, because they need different actions:
   * a known owner's bills leave when that person signs in on this handset; an
   * unknown owner's leave when somebody decides what to do with them, which is
   * not a thing the operator can do at all. Saying "waiting for them to sign in"
   * about a row nobody can claim would be a wrong instruction, and a wrong
   * instruction is worse than a vague one.
   */
  if (s.parkedForAnother > 0 || s.parkedUnknownOwner > 0) {
    const parts: string[] = [];
    if (s.parkedForAnother > 0) {
      parts.push(
        `บิล ${String(s.parkedForAnother)} ใบเป็นของบัญชีอื่น` +
          ` — จะส่งเมื่อเจ้าของบิลเข้าสู่ระบบในเครื่องนี้`,
      );
    }
    if (s.parkedUnknownOwner > 0) {
      parts.push(
        `บิล ${String(s.parkedUnknownOwner)} ใบไม่ทราบว่าเป็นของใคร` +
          ` — ยังส่งไม่ได้ และการเข้าสู่ระบบไม่ช่วย แจ้งเจ้าของร้าน`,
      );
    }
    return { tone: "idle", message: `งานของคุณส่งครบแล้ว · ${parts.join(" · ")}`, action: null };
  }

  if (s.online === true) {
    return { tone: "good", message: "ส่งครบแล้ว", action: null };
  }

  return { tone: "idle", message: "พร้อมใช้งาน", action: null };
}

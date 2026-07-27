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
import type { SessionState } from "./parkedReason.js";

export type StatusTone = "bad" | "warn" | "busy" | "good" | "idle";

/**
 * A button on the strip. The KIND selects the handler and the LABEL comes with
 * it, so the view cannot pair "ส่งอีกครั้ง" with the sign-in handler or invent a
 * label for an action that does something else.
 */
export type StatusAction =
  | { kind: "retry_master_data"; label: string }
  | { kind: "sign_in"; label: string }
  | null;

export interface StatusNotice {
  tone: StatusTone;
  message: string;
  action: StatusAction;
}

export interface StatusInput {
  /** Can this device act as someone at all? Outranks everything below. */
  session: SessionState;
  /** null = nothing has been attempted since launch, so unknown, not assumed good. */
  online: boolean | null;
  /** Bills queued to send (pending + syncing). Excludes parked ones. */
  pending: number;
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
}

export function statusNotice(s: StatusInput): StatusNotice {
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
   * 3. WAITING ON THE OFFICE. Ranked above `failed` on purpose: this one is
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
   * 4. TERMINALLY FAILED BILLS. This used to read "ส่งไม่สำเร็จ N ใบ — ต้องแก้ไข",
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
          ? `ออฟไลน์ — เก็บไว้ในเครื่อง ${String(s.pending)} ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
          : "ออฟไลน์ — บันทึกได้ตามปกติ",
      action: null,
    };
  }

  if (s.pending > 0) {
    return { tone: "busy", message: `กำลังส่ง ${String(s.pending)} ใบ`, action: null };
  }

  if (s.online === true) {
    return { tone: "good", message: "ส่งครบแล้ว", action: null };
  }

  return { tone: "idle", message: "พร้อมใช้งาน", action: null };
}

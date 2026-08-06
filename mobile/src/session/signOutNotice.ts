/**
 * WHAT THE OPERATOR READS ON THE SIGN-OUT SHEET. PURE TypeScript.
 *
 * ONE RENDERER FOR THE WHOLE SHEET, and that is the point of the file.
 *
 * This project has already paid for the alternative: one card drawn by two
 * internally-correct renderers promised "จะดำเนินการให้อัตโนมัติ" two lines above
 * a box saying the system had NOT cancelled the bill, and 448 green assertions
 * could not see it because none rendered the two regions together
 * (lessons/403-is-about-what-the-caller-may-do.md). So the sheet is not a title
 * function plus a body function plus a button function — it is one value, and
 * `lines` IS the draw order. app/ maps over it and adds nothing of its own, so
 * joining `lines` in a proof is faithful by construction rather than by a
 * convention someone has to keep.
 *
 * NO DIAGNOSTICS. SignOutFailure carries a `reason` from the keystore; it is for
 * a log and never reaches this file's output. A developer diagnostic and an
 * operator message are different artifacts
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * NO SERVER PROSE. Every sentence here is the client's. The server sends kind
 * and code; what the yard is told is decided here, in Thai, where the screen is.
 */
import type { SignOutFailure } from "./signOut.js";

export type SignOutTone = "ask" | "warn" | "bad";

/** A button. Kind selects the handler, label travels with it, so the view
 *  cannot wire "ออกจากระบบ" to the cancel path. Same shape as StatusAction. */
export type SignOutAction =
  | { kind: "confirm_sign_out"; label: string }
  | { kind: "retry_sign_out"; label: string }
  | { kind: "dismiss"; label: string };

export interface SignOutCard {
  tone: SignOutTone;
  title: string;
  /** THE DRAW ORDER. The view renders these in this order and inserts nothing. */
  lines: readonly string[];
  /** Buttons, in draw order. */
  actions: readonly SignOutAction[];
}

export interface SignOutCardInput {
  /** Bills queued to send. > 0 refuses the sign-out. */
  pending: number;
  /** Terminally failed bills. Named, never a blocker. */
  failed: number;
  /** Set once an attempt has failed to clear the keystore. */
  failure: SignOutFailure | null;
}

/**
 * SIGNING BACK IN NEEDS A CONNECTION, and this sentence is on the sheet BEFORE
 * the tap, not after it.
 *
 * There is no offline login path — signIn() calls the server — so an operator
 * who signs out on a dead network cannot get back in until it returns. That is
 * the single most consequential fact about this button and the one thing the
 * yard cannot discover by trying.
 */
const NEEDS_NETWORK = "การเข้าสู่ระบบครั้งต่อไปต้องใช้อินเทอร์เน็ต";

/** Never "ติดต่อฝ่ายสนับสนุน": no support desk can clear a keystore or a queue. */
const THE_OWNER = "เจ้าของร้าน";

function failedLine(failed: number): readonly string[] {
  if (failed <= 0) return [];
  // Named, not blocking. These bills never drain, so refusing to sign out over
  // them would make sign-out impossible forever on this device — but they ARE
  // money the server has no record of, so they must not leave the screen either.
  return [
    `มีบิลที่ระบบไม่รับ ${String(failed)} ใบค้างอยู่ในเครื่อง` +
      ` — ออกจากระบบได้ แต่ต้องแจ้งสำนักงาน`,
  ];
}

export function signOutCard(input: SignOutCardInput): SignOutCard {
  /*
   * 1. A FAILED ATTEMPT outranks everything. The operator has already tapped,
   * and the most important thing on the screen is that IT DID NOT HAPPEN — they
   * are still signed in, whatever they expected. Ranked first so it cannot be
   * hidden behind a queue count that arrived in the meantime.
   *
   * Switched on the KIND rather than assumed, so a second failure cause added to
   * SignOutFailure fails to compile here instead of silently inheriting this
   * wording.
   */
  if (input.failure !== null) {
    switch (input.failure.kind) {
      case "clear_failed":
        return {
          tone: "bad",
          title: "ออกจากระบบไม่สำเร็จ",
          lines: [
            // States the device's actual state first. The operator may be
            // handing the phone over right now.
            "เครื่องนี้ยังเข้าสู่ระบบด้วยบัญชีเดิมอยู่ ยังไม่ได้ออกจากระบบ",
            "ยังใช้งานได้ตามปกติ บิลที่บันทึกไว้ไม่หายไปไหน",
            `ลองอีกครั้ง ถ้ายังไม่สำเร็จ ต้องแจ้ง${THE_OWNER}`,
          ],
          actions: [
            { kind: "retry_sign_out", label: "ลองอีกครั้ง" },
            { kind: "dismiss", label: "ปิด" },
          ],
        };
    }
  }

  /*
   * 2. THE QUEUE IS NOT EMPTY. Refused, with the count, and with the reason the
   * wait is short — an operator told only "no" starts looking for a way round.
   */
  if (input.pending > 0) {
    return {
      tone: "warn",
      title: "ยังออกจากระบบไม่ได้",
      lines: [
        `มีบิลรอส่งขึ้นระบบ ${String(input.pending)} ใบ`,
        // The ruling's reason, in the yard's terms: you need the network to sign
        // back in anyway, and the moment you have it these go by themselves.
        `${NEEDS_NETWORK}อยู่แล้ว และเมื่อเชื่อมต่อได้ บิลจะส่งเองภายในไม่กี่วินาที`,
        "รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้",
        ...failedLine(input.failed),
      ],
      actions: [{ kind: "dismiss", label: "ปิด" }],
    };
  }

  /*
   * 3. THE CONFIRMATION. Queue empty, so the sign-out can proceed.
   */
  return {
    tone: "ask",
    title: "ออกจากระบบ?",
    lines: [
      "บิลทั้งหมดส่งขึ้นระบบครบแล้ว",
      NEEDS_NETWORK,
      "ข้อมูลสินค้าและผู้ขายจะยังอยู่ในเครื่อง",
      ...failedLine(input.failed),
    ],
    actions: [
      { kind: "confirm_sign_out", label: "ออกจากระบบ" },
      { kind: "dismiss", label: "ยกเลิก" },
    ],
  };
}

/**
 * The whole sheet as ONE string, in draw order, title first.
 *
 * Exported because the PROOF must read what the operator reads rather than what
 * a renderer returns in isolation — and because a helper both sides share cannot
 * drift from the order the view uses, since the view maps `lines` directly.
 */
export function signOutCardText(card: SignOutCard): string {
  return [card.title, ...card.lines, ...card.actions.map((a) => a.label)].join(" ");
}

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
import { totalOwed } from "../sync/outbox.js";
import type { OutboxKind, OwedByKind } from "../sync/outbox.js";
import type { SessionState } from "../sync/parkedReason.js";
import type { SignOutFailure } from "./signOut.js";

export type SignOutTone = "ask" | "warn" | "bad";

/** A button. Kind selects the handler, label travels with it, so the view
 *  cannot wire "ออกจากระบบ" to the cancel path. Same shape as StatusAction. */
export type SignOutAction =
  | { kind: "confirm_sign_out"; label: string }
  | { kind: "retry_sign_out"; label: string }
  | { kind: "sign_in"; label: string }
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
  /**
   * EVERY KIND OF WORK THE DEVICE STILL OWES. Anything > 0 refuses the sign-out.
   *
   * THE SAME VALUE THE GATE READS, and that is a requirement rather than a
   * convenience. It was `pending: number`, and App.tsx handed the GATE
   * `mine + mineBlocked` while handing THIS `mine` — so a device holding one
   * bill parked on missing master data drew the confirmation card, with an
   * ออกจากระบบ button, over a gate that was going to refuse: a green button
   * that does nothing, which
   * lessons/correct-classification-can-still-render-as-an-error.md's R2b
   * amendment calls a worse defect than the one being fixed. One type, one
   * value, passed to both.
   *
   * IT IS A MAP AND NOT A TOTAL because the wording is derived from the CAUSE:
   * "N bills are waiting to be sent" is a false sentence over an owed seller,
   * and a total cannot be un-summed. See OWED_LINE below.
   */
  owed: OwedByKind;
  /** Terminally failed bills. Named, never a blocker. */
  failed: number;
  /** Set once an attempt has failed to clear the keystore. */
  failure: SignOutFailure | null;
  /**
   * CAN THIS DEVICE ACT AS ANYONE RIGHT NOW. R2b.
   *
   * `pending` says the queue is not empty; it cannot say WHY, and the two whys
   * have opposite instructions. REQUIRED, never optional with "active" as a
   * default: an optional field would leave every existing call site rendering
   * the offline sentence while compiling clean, which is
   * lessons/correct-classification-can-still-render-as-an-error.md's third
   * amendment exactly — the next screen must be a compile error, not a silent
   * inheritance of the wording that was written for the only caller there was.
   */
  session: SessionState;
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

/**
 * ONE SENTENCE PER KIND OF OWED WORK, AND THE TABLE IS TOTAL OVER `OutboxKind`.
 *
 * WHY A TABLE RATHER THAN A COUNT. `มีบิลรอส่ง N ใบ` was the only
 * sentence this sheet had, because for as long as the gate counted bills the
 * only thing it could be refusing over was a bill. It is now refusing over a
 * SELLER as well, and `ใบ` is the classifier for a document — a seller is a
 * person, counted `ราย` — so the old sentence would be wrong in its grammar
 * before it was wrong in its meaning. A message that names what to wait for
 * must be DERIVED from the cause
 * (lessons/correct-classification-can-still-render-as-an-error.md, point 3).
 *
 * WHY IT IS TOTAL AND NOT A LOOKUP WITH A FALLBACK. A fallback is a sentence
 * the fourth kind would inherit silently, which is the defaulted-parameter
 * failure this project has now paid for three times. Typed as a mapped type
 * over the union, a fourth kind is a COMPILE ERROR here until somebody writes
 * its sentence — the same move as `forbiddenReason`'s required `action` and the
 * required `session` on this very input.
 *
 * NO TOTAL IS EVER RENDERED. `OwedByKind` counts units of WORK, not rows: a
 * bill saved offline and cancelled before it synced is owed by `bill_send` and
 * by `bill_void` at once, and both are true. Summing them onto the screen would
 * print a number of "bills" that the yard cannot reconcile with anything it can
 * see.
 */
const OWED_LINE: { readonly [K in OutboxKind]: (n: number) => string } = {
  // Unchanged, word for word, including the classifier — this is the sentence
  // the sheet has carried since R1b and the one a proof already asserts the
  // count inside.
  bill_send: (n) => `มีบิลรอส่ง ${String(n)} ใบ`,
  // A cancellation the yard has ordered and the server has not been told about.
  // It says แจ้ง (tell) rather than ส่ง (send) because the bill itself may
  // already be on the server — what is owed is the reversal, not the document.
  bill_void: (n) => `มีบิลรอแจ้งยกเลิก ${String(n)} ใบ`,
  // ราย, not ใบ: a seller is a person. And "เพิ่มใหม่ในเครื่อง" says where it
  // was created, because that is the whole reason the server has not got it.
  seller_create: (n) => `มีผู้ขายที่เพิ่มใหม่ในเครื่องรอส่ง ${String(n)} ราย`,
};

/**
 * The owed lines, in registry order, one per kind that has any.
 *
 * ENUMERATED AT RUN TIME over the map's own keys. A hand-written list of three
 * calls would compile for ever and stop mentioning the fourth kind, with the
 * gate still refusing over it — a refusal whose reason is not on the screen,
 * which is the state the R2b amendment describes as a sentence asking for
 * patience with no control to audit.
 */
function owedLines(owed: OwedByKind): readonly string[] {
  return (Object.keys(owed) as OutboxKind[])
    .filter((kind) => owed[kind] > 0)
    .map((kind) => OWED_LINE[kind](owed[kind]));
}

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
   * 2. THE QUEUE IS NOT EMPTY. Refused either way — the RULING is the same and
   * so is the title — but the reason is not, and until R2b this said the offline
   * reason in both cases.
   *
   * WHAT THE OPERATOR READ, 2026-08-07, on a handset at full signal whose token
   * the server was refusing on every request: "และเมื่อเชื่อมต่อได้ บิลจะส่งเอง
   * ภายในไม่กี่วินาที / รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้". Both false. The phone
   * was already connected, so the condition the first sentence waits on had
   * already arrived and changed nothing; and the second names a wait that ends
   * only when someone signs in — which this sheet neither said nor offered,
   * while the strip two centimetres above it said both.
   *
   * The predicate is `session !== "active"`, character for character the one
   * statusNotice.ts uses, because the strip and this sheet are two renderers of
   * one fact and a second predicate is how they come to disagree. "signed_out"
   * is not reachable with this sheet open — App.tsx renders the sign-out button
   * only while `token !== null` — but a union with three members gets three,
   * rather than a branch that is correct only while a distant condition holds.
   */
  if (totalOwed(input.owed) > 0) {
    const noSession = input.session !== "active";
    /*
     * THE SAME HEAD SPLIT statusNotice.ts MAKES, and for the same reason: one
     * has never worked yet, the other stopped working, and they read differently
     * to an operator mid-shift. A device that has NOT signed in this launch has
     * not "run out of time", so it must not be told it has — which is what the
     * first draft of this branch said, on the unreachability argued above.
     */
    const head = input.session === "expired" ? "หมดเวลาเข้าใช้งาน" : "ยังไม่ได้เข้าสู่ระบบ";
    return {
      // Amber in both, for the reason statusNotice gives the session case: a
      // waiting state with a known fix is not a fault.
      tone: "warn",
      // The gate refuses either way, so the ruling must read the same. Only the
      // reason and the way out differ.
      title: "ยังออกจากระบบไม่ได้",
      lines: [
        // ONE LINE PER KIND, in registry order. Not one summed sentence: see
        // OWED_LINE. This is also the presence sibling the surfaces criterion
        // requires — a sheet that merely STOPPED saying "everything is sent"
        // and named nothing would satisfy every absence assertion and tell the
        // operator nothing about why they are being refused.
        ...owedLines(input.owed),
        ...(noSession
          ? [
              // The head is statusNotice.ts's, word for word, and ยังอยู่ครบ is
              // the strip's too: one fact must not carry two words on one
              // screen. ยังอยู่ครบ is needed HERE rather than left to the strip
              // because this sheet is a modal that COVERS the strip while it is
              // open — told only that the work will not be sent, an operator
              // can read that as "the work is gone".
              //
              // งานที่ค้างอยู่, not บิล, since P1.8b: the refusal is no longer
              // always about bills, and this line has no count to make it
              // specific. The per-kind lines above say WHAT is waiting; this one
              // says it is all still here.
              `${head} — งานที่ค้างอยู่ยังอยู่ครบ แต่จะไม่ถูกส่ง`,
              // The ACCOUNT is named because the queue carries no identity of
              // its own (see THE GATE in signOut.ts): this work drains under
              // whoever is signed in when it goes.
              "ต้องเข้าสู่ระบบใหม่ด้วยบัญชีเดิม จึงจะถูกส่ง",
            ]
          : [
              // True HERE: the session works, so the network coming back really
              // is the whole of the wait. ระบบจะส่งให้เอง, not บิลจะส่งเอง — the
              // promise is about whatever the lines above named, and naming
              // bills inside it was false the day a seller could be owed.
              `${NEEDS_NETWORK}อยู่แล้ว และเมื่อเชื่อมต่อได้ ระบบจะส่งให้เองภายในไม่กี่วินาที`,
              "รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้",
            ]),
        ...failedLine(input.failed),
      ],
      // A message naming an exit the operator cannot take from where they are
      // standing is half a message. That is statusNotice.ts's argument for
      // putting the button ON the strip, and it applies with more force to a
      // modal that covers the strip, not less.
      actions: noSession
        ? [
            // The SAME label the strip and the daily screen use for the same
            // act. Three renderers, one word.
            { kind: "sign_in", label: "เข้าสู่ระบบ" },
            { kind: "dismiss", label: "ปิด" },
          ]
        : [{ kind: "dismiss", label: "ปิด" }],
    };
  }

  /*
   * 3. THE CONFIRMATION. Queue empty, so the sign-out can proceed.
   */
  return {
    tone: "ask",
    title: "ออกจากระบบ?",
    lines: [
      "บิลทั้งหมดส่งครบแล้ว",
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

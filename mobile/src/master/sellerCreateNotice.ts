/**
 * WHAT THE ADD-SELLER SCREEN SAYS, for every one of the eight outcomes
 * `createSeller.ts` can return. PURE TypeScript — no React Native, no Expo, no
 * node — so the headless proof drives exactly what the yard reads.
 *
 * WHY IT IS HERE AND NOT IN app/AddSellerSheet.tsx. `tsconfig.node.json` sets
 * `rootDir: "src"`, so nothing under `app/` can be compiled by the proof
 * program. A sentence living there is unproven BY CONSTRUCTION — not weakly
 * tested, untested — and that is how an expired session came to be displayed as
 * ออฟไลน์ with every proof green (lessons/401-is-about-the-caller-not-the-bill.md,
 * "Why every proof was green, again"). Same move, same reason, as
 * `sync/statusNotice.ts` and `sync/parkedReason.ts`. The sheet renders whatever
 * this returns and decides nothing.
 *
 * ===========================================================================
 * TWO OF THE EIGHT CANNOT BE PRODUCED BY TODAY'S SERVER, AND THAT IS THE POINT
 * ===========================================================================
 * `forbidden` is unreachable because `POST /sellers` is behind `get_principal`
 * (server/app/master.py, create_seller), and `invalid` is reachable only through
 * a 422 whose body is the one this route must never read. A message nobody can
 * trigger is a message that can be wrong with nobody knowing — so the claim is
 * split in two. Whether the TRANSPORT can produce an outcome is phase 2's
 * measurement and is not asserted here. Whether the RENDERER handles one is a
 * property of a pure function, and the proof constructs all eight directly.
 *
 * ===========================================================================
 * THE CALL SITE IS A REQUIRED ARGUMENT
 * ===========================================================================
 * lessons/correct-classification-can-still-render-as-an-error.md, the 2d
 * amendment: a wording table keyed only on the server's answer is right for
 * exactly as long as there is one caller. One `require_admin` answers
 * `admin_required` for every admin path there is, and wording hardcoded to the
 * only caller once told an owner opening a READ-ONLY REPORT that a bill had not
 * been cancelled. Every layer was correct; only the sentence was about something
 * that never happened.
 *
 * So `site` is REQUIRED and never optional-with-today's-value-as-the-default. A
 * default would leave the yard's sentences as the inheritance of every screen
 * added later — the same bug wearing a parameter. Today there is one site;
 * adding a second is a compile error at WORDING below until somebody writes all
 * eight of its sentences, which is the only way the sweep is known to be
 * complete rather than remembered.
 */
import type { CreateSellerOutcome, CreatedSeller } from "./createSeller.js";

/**
 * WHICH SCREEN IS ASKING. One member today: the seller picker at the
 * weighbridge, reached while a truck is on the scale.
 *
 * A second member belongs here the moment another screen creates a seller — the
 * back office, say, where "ต้องแจ้งเจ้าของร้าน" is addressed to the person
 * already reading it and "บิลจะค้างรอสำนักงาน" is about a bill that does not
 * exist.
 */
export type SellerCreateSite = "yard_add_seller";

/**
 * WHO OWNS THE NEXT ACTION. A tone is a STATE here, not a colour — the same rule
 * `sync/parkedReason.ts` states for `NoticeTone`. Two states may be drawn alike;
 * a state with no tone of its own cannot be told apart anywhere.
 *
 *   created    nobody owes anything; the row exists.
 *   fix_form   THE OPERATOR, on this form, now. The fix is centimetres away.
 *   session    the operator, by signing in. Nothing about the form is wrong.
 *   forbidden  THE SHOP OWNER, elsewhere. No tap on this device changes it.
 *   retry      the operator, by asking again. Nothing happens on its own.
 *   verify     the operator, by LOOKING. The outcome is genuinely unknown.
 */
export type SellerCreateTone =
  | "created"
  | "fix_form"
  | "session"
  | "forbidden"
  | "retry"
  | "verify";

/**
 * The one control the notice offers, or null where there is none.
 *
 * THE LABEL TRAVELS WITH THE KIND, exactly as `StatusAction` does, so the view
 * cannot pair "ลองอีกครั้ง" with the sign-in handler or invent a label for an
 * action that does something else. `forbidden` carries null on purpose: an
 * action the app cannot perform must never be dressed as one it can, and there
 * is no tap on this handset that grants a role.
 */
export type SellerCreateButtonKind =
  | "pick_seller"
  | "back_to_form"
  | "sign_in"
  | "retry"
  | "refresh_list";

export type SellerCreateButton = { kind: SellerCreateButtonKind; label: string } | null;

/**
 * WHAT THE SCREEN DRAWS, and the order it draws it in: headline, then every
 * line, then the button's label.
 *
 * THE ORDER IS PART OF THE CONTRACT. `app/AddSellerSheet.tsx` draws exactly
 * this sequence and the proof asserts the CONCATENATION rather than the parts,
 * because the defect this discipline exists for was one card whose two regions
 * were each internally correct and which contradicted itself as a whole — 448
 * green cells could not see it
 * (lessons/403-is-about-what-the-caller-may-do.md, "one card, two renderers").
 */
export interface SellerCreateNotice {
  tone: SellerCreateTone;
  headline: string;
  lines: readonly string[];
  action: SellerCreateButton;
}

/**
 * THE SENTENCE SIX OF THE EIGHT SHARE, and the two that must not carry it.
 *
 * `created` must not, obviously. `ambiguous` must not either, and that is the
 * whole of why it is the hardest member: the server may have created the seller
 * and there is no idempotency_key on this route to recover with. Saying "not
 * added" would be a confident lie half the time, and it is the half that ends
 * with a duplicate seller row in the shop's master data.
 */
const NOT_CREATED = "ยังไม่ได้เพิ่มผู้ขายรายนี้";

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";

/**
 * Every entry is a function of ITS OWN member, keyed by the member's own tag.
 *
 * Written as a mapped type over `CreateSellerOutcome["kind"]` rather than as a
 * hand-listed interface: a ninth member added to that union is then a compile
 * error HERE as well as at the switch below, instead of a silent fall-through
 * at one of the two.
 */
type SiteWording = {
  [K in CreateSellerOutcome["kind"]]: (
    outcome: Extract<CreateSellerOutcome, { kind: K }>,
  ) => SellerCreateNotice;
};

/* --------------------------------------------------- the yard's sentences -- */

/**
 * WHAT A 403 SAYS, per server code, at THIS site.
 *
 * Four rules, all of them things the wrong wording would cost real money or
 * real trust — the same rules `sync/parkedReason.ts` states for `forbiddenReason`
 * and for the same reasons:
 *
 *   1. It never says "error". Nothing is broken. This account simply may not do
 *      this, which is a decision somebody made on purpose.
 *   2. It never invites a sign-in — that is the 401's fix, and here it is a loop
 *      with a person in it: the same account comes back with the same role.
 *   3. It names the shop OWNER. Not support, who cannot grant a role, and not
 *      the office, who set prices and grades.
 *   4. It names the ROLE the owner can change it to, and NEVER a permission to
 *      "open". The role schema is two values — `users_role_check` is
 *      `admin`/`staff`, not a permission system — so the only move that resolves
 *      this is making the account an admin (`ผู้ดูแลระบบ`, the server's own word
 *      for it). Saying "open a permission for this account" named an action the
 *      schema has no verb for, and a wrong instruction the office ACTS ON is
 *      worse than a vague one (the 2c-6 finding).
 *
 * AND THE FALLBACK DOES NOT PRINT THE CODE, which is where this DIVERGES from
 * `billNotice`, deliberately. That function appends `รหัส: <code>` for an
 * unrecognised code, and on a bill card — a surface that exists to be read out
 * during a support conversation — that is right. This is a form at the
 * weighbridge. An English identifier on it is a developer diagnostic arriving by
 * another route, and it names nothing the operator can act on.
 */
const YARD_FORBIDDEN: Record<string, { headline: string; what: string }> = {
  admin_required: {
    headline: "บัญชีนี้ไม่มีสิทธิ์เพิ่มผู้ขาย",
    // Rule 4 above: name the ROLE, not a permission the schema cannot grant.
    what: `${NOT_CREATED} — ${ASK_THE_OWNER}ให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ`,
  },
};

const YARD_FORBIDDEN_UNKNOWN = {
  headline: "บัญชีนี้ทำรายการนี้ไม่ได้",
  what: `${NOT_CREATED} — ${ASK_THE_OWNER}`,
};

const YARD: SiteWording = {
  /**
   * THE ROW EXISTS. It names the seller and THE CODE THE SERVER ASSIGNED, which
   * is the half of D2 the operator cannot see any other way: they were allowed
   * to leave the field blank precisely so nobody has to invent a unique string
   * with a truck on the weighbridge, and the code that came back is what goes on
   * the shop's paper.
   *
   * AND IT SAYS THE GRADE IS UNSET, derived from the value rather than
   * hardcoded. This form does not offer a grade (ROADMAP D1: a yard phone must
   * not re-price), so every seller created here arrives with none — and a
   * grade-less seller's bill parks at 424 seller_grade_unset. `SellerPicker`
   * already warns about this on the ROW, "said HERE, before the pick, not after
   * the bill is refused", and the operator who has just created a seller and
   * taps the button below never sees that row. Without this line they would weigh
   * a full load, pay cash, and meet the parking afterwards.
   *
   * NOTHING ELSE OFF THE SELLER REACHES THIS TEXT. `CreatedSeller` also carries
   * `id`, `id_number`, `address` and `vehicle_no`; a screen that printed an ID
   * card number would be lessons/a-refusal-hands-back-what-it-refused.md arriving
   * through the success path instead of the refusal one.
   */
  created: (outcome) => yardCreated(outcome.seller),

  /**
   * THE OPERATOR TYPED A CODE AND IT IS TAKEN. Reachable only in that case —
   * `createSeller.ts` reads `suppliedCode` off the DRAFT before the request
   * leaves, so this member cannot arrive for somebody who typed nothing.
   *
   * BOTH FIXES ARE NAMED, AND BOTH ARE ON THE SCREEN ALREADY. Ask of every
   * refusal whether the thing that resolves it is already visible: here the code
   * field is two centimetres up, and a sheet that said "ask the office" while a
   * working field sat above it would be the R2b defect again.
   */
  duplicate_code: () => ({
    tone: "fix_form",
    headline: "รหัสนี้ถูกใช้ไปแล้ว",
    lines: [
      `ร้านนี้มีผู้ขายที่ใช้รหัสนี้อยู่แล้ว ${NOT_CREATED}`,
      "แก้เป็นรหัสอื่น หรือเว้นรหัสว่างไว้ ให้ระบบกำหนดรหัสให้",
    ],
    action: { kind: "back_to_form", label: "แก้รหัส" },
  }),

  /**
   * THE OPERATOR TYPED NOTHING, and the server could not mint a code.
   *
   * THE OPPOSITE INSTRUCTION FROM THE MEMBER ABOVE, and it has to be: telling
   * this caller their code was taken would name a value they never supplied.
   * The server refuses to conflate the two in its own words (server/app/master.py
   * at the raise: "the caller supplied no code, so naming one as taken would be a
   * confident lie about a value they never sent"), and a client that collapsed
   * them would send the office hunting for a collision that does not exist.
   */
  code_assignment_failed: () => ({
    tone: "fix_form",
    headline: "ระบบออกรหัสผู้ขายให้ไม่ได้",
    lines: [NOT_CREATED, "ให้กรอกรหัสผู้ขายเอง แล้วบันทึกอีกครั้ง"],
    action: { kind: "back_to_form", label: "กรอกรหัสเอง" },
  }),

  /**
   * ABOUT THE CALLER, NOT ABOUT THE SELLER. Nothing typed is wrong and nothing
   * about the form needs changing (lessons/401-is-about-the-caller-not-the-bill.md).
   *
   * IT CARRIES ITS OWN EXIT, and here that is not a nicety. This notice is drawn
   * inside a Modal stacked over the picker, which is itself a Modal: the status
   * strip's sign-in button — the app's usual answer to an expired session — is
   * physically underneath both and cannot be reached. A message naming an action
   * the operator cannot reach is half a message.
   */
  session_expired: () => ({
    tone: "session",
    headline: "หมดเวลาเข้าใช้งาน",
    lines: [`${NOT_CREATED} ต้องเข้าสู่ระบบใหม่ก่อน`],
    action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
  }),

  forbidden: (outcome) => {
    const text = YARD_FORBIDDEN[outcome.code] ?? YARD_FORBIDDEN_UNKNOWN;
    return {
      tone: "forbidden",
      headline: text.headline,
      lines: [text.what],
      // No button, on purpose. The only action is a conversation.
      action: null,
    };
  },

  /**
   * THE PAYLOAD WAS REFUSED, AND NOTHING IS ECHOED BACK. The union carries no
   * value at all — see `createSeller.ts`'s header — because a 422 on THIS route
   * is the one whose body can mirror an ID CARD NUMBER.
   *
   * DELIBERATELY VAGUE ABOUT WHICH FIELD, and that is not laziness. Six fields
   * can be refused for length and the client is not told which; naming one would
   * be a confidently wrong instruction, and a wrong instruction is worse than a
   * vague one because it gets acted on. The office is named as the fallback
   * because it is a real actor with a screen that can do this.
   *
   * ONE REFUSAL IS COLLAPSED INTO THIS MEMBER AND IT IS RECORDED RATHER THAN
   * HIDDEN: `code_assignment_overflow` is a server-named 422 whose real
   * instruction is "type a code yourself", and telling it apart needs the body
   * this route must not read. "ตรวจข้อมูลที่กรอกอีกครั้ง" is compatible with it
   * — the code is one of the things typed — but it does not name it.
   */
  invalid: () => ({
    tone: "fix_form",
    headline: "ระบบไม่รับข้อมูลนี้",
    lines: [
      `${NOT_CREATED} ตรวจข้อมูลที่กรอกอีกครั้ง`,
      "ถ้าแก้แล้วยังไม่ได้ ให้สำนักงานเพิ่มผู้ขายรายนี้ให้",
    ],
    action: { kind: "back_to_form", label: "แก้ไขข้อมูล" },
  }),

  /**
   * NO ANSWER, OR AN ANSWER NOBODY CAN USE — AND NO PROMISE TO SEND IT LATER.
   *
   * There is NO QUEUE for sellers. Bills have one, and the yard has learnt from
   * every bill card that an unsent thing goes by itself when the signal returns.
   * That expectation is exactly wrong here, so the denial is stated rather than
   * merely not-promised: nothing is held, nothing will be retried, and the only
   * thing that adds this seller is somebody pressing the button again.
   *
   * A WAIT IS A PROMISE ABOUT THE FUTURE, EXACTLY AS MUCH AS A BUTTON IS
   * (lessons/correct-classification-can-still-render-as-an-error.md, the R2b
   * amendment). "รอสักครู่" would offer no control anyone can audit.
   */
  unavailable: () => ({
    tone: "retry",
    headline: "ติดต่อเซิร์ฟเวอร์ไม่ได้ตอนนี้",
    lines: [
      NOT_CREATED,
      "ระบบไม่ได้เก็บผู้ขายรายนี้ไว้ส่งให้ทีหลัง ถ้าต้องการเพิ่ม ต้องกดลองอีกครั้งเมื่อเชื่อมต่อได้",
    ],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  }),

  /**
   * THE HARDEST ONE: A 2xx WHOSE BODY COULD NOT BE READ AS A SELLER.
   *
   * The server said it created something and this client cannot say what. It is
   * NOT a success and NOT a failure, and there is no idempotency_key on this
   * route — `sellers` has no such column — so it cannot be retried safely and it
   * cannot be reported as done. Both of the confident sentences are therefore
   * forbidden: `NOT_CREATED` would be a lie half the time, and "เพิ่มผู้ขายแล้ว"
   * the other half.
   *
   * THE HONEST INSTRUCTION IS TO LOOK, and the order of the instruction is the
   * content: refresh, SEARCH FOR THE NAME, and only then add again. A bare
   * "try again" here is how a shop ends up with two master rows for one person,
   * on different codes, with bills split across both.
   */
  ambiguous: () => ({
    tone: "verify",
    headline: "ไม่รู้ผลของการเพิ่มผู้ขายรายนี้",
    lines: [
      "ระบบตอบกลับมาไม่ครบ จึงบอกไม่ได้ว่าเพิ่มให้แล้วหรือยัง",
      "ให้รีเฟรชรายชื่อผู้ขายแล้วค้นหาชื่อนี้ก่อน ถ้ายังไม่มีจึงเพิ่มใหม่อีกครั้ง",
    ],
    action: { kind: "refresh_list", label: "รีเฟรชรายชื่อผู้ขาย" },
  }),
};

function yardCreated(seller: CreatedSeller): SellerCreateNotice {
  const lines = [`${seller.name} · รหัส ${seller.code}`];
  if (seller.grade === null) {
    lines.push("ยังไม่ได้จัดเกรด — บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งได้");
  }
  return {
    tone: "created",
    headline: "เพิ่มผู้ขายแล้ว",
    lines,
    action: { kind: "pick_seller", label: "เลือกผู้ขายรายนี้" },
  };
}

const WORDING: Record<SellerCreateSite, SiteWording> = {
  yard_add_seller: YARD,
};

/**
 * The operator-facing result of one create attempt.
 *
 * Takes the OUTCOME and the SITE, and nothing else. There is no `detail`, no
 * `message`, no status and no response body among its parameters, so there is no
 * route by which a diagnostic could reach the screen even if somebody wanted one
 * — the [[correct-classification-can-still-render-as-an-error]] rule applied at
 * the signature rather than at the render: prefer a shape where the leak is
 * unrepresentable.
 */
export function sellerCreateNotice(
  outcome: CreateSellerOutcome,
  site: SellerCreateSite,
): SellerCreateNotice {
  const w = WORDING[site];
  switch (outcome.kind) {
    case "created":
      return w.created(outcome);
    case "duplicate_code":
      return w.duplicate_code(outcome);
    case "code_assignment_failed":
      return w.code_assignment_failed(outcome);
    case "session_expired":
      return w.session_expired(outcome);
    case "forbidden":
      return w.forbidden(outcome);
    case "invalid":
      return w.invalid(outcome);
    case "unavailable":
      return w.unavailable(outcome);
    case "ambiguous":
      return w.ambiguous(outcome);
    /*
     * A NINTH MEMBER IS A COMPILE ERROR HERE. Not a fall-through, not a blank
     * card, not a green button that does nothing — which is a worse defect than
     * the one being fixed (the R2b amendment). Measured, not asserted: deleting
     * any one arm above makes `outcome` non-`never` at this line and
     * `npm run typecheck` fails. A proof cannot observe its own compilation, so
     * the compiler error is quoted in the phase report instead.
     */
    default: {
      const never: never = outcome;
      throw new Error(`unhandled create-seller outcome: ${JSON.stringify(never)}`);
    }
  }
}

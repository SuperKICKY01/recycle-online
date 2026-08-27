/**
 * WHAT THE SAVE CONFIRMATION SAYS ABOUT THE BILL'S FATE — the two sentences that
 * used to be two independent renderers in `app/ConfirmSaveDialog.tsx` and
 * contradicted each other as a whole.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * drives exactly what the yard reads on the last screen before the cash leaves.
 *
 * ===========================================================================
 * WHY IT IS HERE AND NOT IN app/ConfirmSaveDialog.tsx
 * ===========================================================================
 * `tsconfig.node.json` sets `rootDir: "src"`, so nothing under `app/` can be
 * compiled by the proof program. A sentence living there is unproven BY
 * CONSTRUCTION — not weakly tested, untested. Same move, same reason, as
 * `sellerCreateNotice.ts`, `sync/parkedReason.ts` and `master/freshness.ts`: the
 * dialog renders whatever this returns and decides nothing.
 *
 * ===========================================================================
 * THE DEFECT THIS EXISTS TO KILL — one card, two renderers
 * ===========================================================================
 * For a seller with no grade the dialog drew, two centimetres apart:
 *
 *   red   (grade-conditional): the bill will WAIT for the office before it
 *         enters the system;
 *   amber (UNCONDITIONAL):     once saved the bill enters the system IMMEDIATELY.
 *
 * Both were internally correct and neither renderer knew the other existed — the
 * amber line was a bare constant with no `sellerGrade` in it. The two claims are
 * opposite, and the operator does not read a function, they read a card
 * (lessons/403-is-about-what-the-caller-may-do.md, "one card, two renderers";
 * lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * ===========================================================================
 * THE FIX IS BY CAUSE, NOT BY WORDING
 * ===========================================================================
 * The cause is that the "does the bill enter the system now" claim was baked
 * UNCONDITIONALLY into the amber line while a separate conditional red line said
 * the opposite. So that claim is DERIVED FROM THE GRADE here — the one fact that
 * decides it — and the irreversibility claim ("cannot edit; void and reissue")
 * is split out as the ONE thing that is true either way:
 *
 *   graded      -> warn says the bill will enter the system at once. No park.
 *   grade-less  -> park says the bill will NOT yet enter the system and waits
 *                  for the office; warn says only that it cannot be edited.
 *
 * The claim that it enters the system now is produced by ONE branch, the claim
 * that it waits by the OTHER, so the two can never appear on one card. The proof
 * asserts that NEGATIVELY, over the concatenation in draw order — the forbidden
 * pairing (enters-now AND waits) never appears — because a defect between two
 * correct regions is invisible to an assertion that reads either alone.
 */

/**
 * A tone is a STATE, not a colour — the same rule `sync/parkedReason.ts` states
 * for `NoticeTone`. `park` is the red box drawn only when the bill will not
 * enter the system at save time; `warn` is the amber box drawn every time.
 */
export type SaveConfirmTone = "park" | "warn";

export interface SaveConfirmNotice {
  /**
   * The red box, or null. Present ONLY when the bill will NOT enter the system
   * when it is saved — today, that is a seller with no grade, whose bill parks
   * at 424 seller_grade_unset. It carries the "waits for the office" claim, and
   * it is the ONLY place that claim is made.
   */
  park: string | null;
  /**
   * The amber box, ALWAYS present. It carries the irreversibility — the one
   * thing true of every save — and, for a bill that WILL enter the system now,
   * that fact too. It never carries "enters now" for a bill that parks, which is
   * the whole of the contradiction it used to cause.
   */
  warn: string;
}

/**
 * The irreversibility, on its own. True of EVERY save regardless of grade, so it
 * is stated once and shared by both branches: a bill cannot be edited, and a
 * wrong one is unwound by a void that stays on the record for ever (hard rule 5).
 */
const IRREVERSIBLE = "แก้ไขไม่ได้ — หากผิดต้องยกเลิกบิลและออกใบใหม่";

/**
 * WHAT THE CONFIRMATION SAYS ABOUT THE BILL, derived from the one fact that
 * decides whether it enters the system at save time.
 *
 * `sellerGrade` is `string | null`, exactly as it arrives from the seller row.
 * Null is the seller-has-no-grade case (the bill will park); any string is a
 * graded seller (the bill goes on to the queue and syncs). Nothing else is read,
 * so no other value could reach the screen even by accident — the leak is
 * unrepresentable, the same discipline `sellerCreateNotice.ts` applies at its
 * own signature.
 */
export function saveConfirmNotice(sellerGrade: string | null): SaveConfirmNotice {
  if (sellerGrade === null) {
    return {
      park: "ผู้ขายรายนี้ยังไม่มีเกรด — บันทึกได้ แต่บิลจะยังไม่ส่งเข้าระบบ ต้องรอสำนักงานกำหนดเกรดก่อน",
      warn: IRREVERSIBLE,
    };
  }
  return {
    park: null,
    warn: `บันทึกแล้วจะส่งเข้าระบบทันที ${IRREVERSIBLE}`,
  };
}

/**
 * WHAT THE OPERATOR IS TOLD WHEN A CART ON THIS DEVICE IS NOT THEIRS.
 *
 * PURE TypeScript — no React Native, no Expo, no node — for the reason
 * freshness.ts, signOut.ts and rowOwner.ts all give: files under app/ are
 * outside the node proof program entirely (tsconfig.node.json rootDir "src"), so
 * an operator-facing sentence that lives there is a sentence no assertion can
 * ever go red on, and every one that shipped wrong was one of those.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A SENTENCE HERE AT ALL
 * ---------------------------------------------------------------------------
 * Withholding a draft leaves the screen showing "ยังไม่มีบิลที่กำลังทำอยู่" —
 * byte-identical to an ordinary morning with nothing in progress. That is the
 * failure ROADMAP.md section P1.7 names as "WAITING HAS TO BE VISIBLE": work
 * that waits silently is work that disappears without anybody noticing. The
 * operator who left half a cart last night must be able to tell "it is gone"
 * from "it is being kept for somebody else".
 *
 * NOT A DIALOG, for the reason that section also gives: a dialog becomes a
 * reflex to dismiss within two days. A line that sits on the start screen and
 * vanishes on its own when the owner signs in.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MAY NOT SAY
 * ---------------------------------------------------------------------------
 * NOT "ของบัญชีอื่น" ("another account's"). The count covers drafts with an
 * UNKNOWN owner as well as a different one, and an unknown-owner cart on an
 * upgraded handset is probably the shop's own work — quite possibly this
 * operator's. Naming it as somebody else's would be a false statement on the
 * screen, the same correction the master cache needed for "another shop's"
 * versus "not this shop's". "ไม่ใช่ของบัญชีนี้" is true of both.
 *
 * NOT A REMEDY. The obvious sentence — "it comes back when they sign in" — is
 * true for a different owner and FALSE for an unknown one, which no sign-in can
 * ever claim, because null matches nobody. Promising a release that may never
 * arrive is exactly what lessons/correct-classification-can-still-render-as-an-
 * error.md forbids: never promise what the system cannot perform. So this states
 * only what is certainly true — the work is on the device, it has not been
 * deleted, and its owner has not been changed.
 *
 * NOT WHOSE, AND NOT WHAT IS ON IT. A count, for the reason the parked-bill
 * strip carries a count: "Not whose, and not their contents."
 */

/**
 * The line to put under the start screen's heading, or null when there is
 * nothing being kept.
 *
 * Takes the COUNT rather than a boolean so the sentence can say how many, and
 * so a caller cannot pass `true` out of habit — the value has to have been
 * counted. Zero and negative both read as nothing: a negative is unreachable
 * from the store (withheld is total minus owned) and is treated as nothing
 * rather than trusted into a sentence saying "-1 bills".
 */
export function withheldDraftNotice(withheld: number): string | null {
  if (withheld <= 0) return null;
  return (
    `มีบิลที่ทำค้างไว้ ${String(withheld)} ใบในเครื่องนี้ ที่ไม่ใช่ของบัญชีนี้` +
    ` — ระบบเก็บไว้ให้ ไม่ได้ลบ และไม่ได้เปลี่ยนเจ้าของ`
  );
}

/**
 * THE THAI LABEL FOR A ROLE — ONE place, so the account profile and the roster
 * cannot drift on what "admin" is called on screen.
 *
 * `ผู้ดูแลระบบ` is the SERVER'S OWN word for the admin role — it is the word the
 * settings and send-path refusals use (`บัญชีนี้ไม่มีสิทธิ์… ให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ`).
 * Using anything else here would tell an owner their account is one thing while
 * every refusal names another. `พนักงาน` is staff. `เจ้าของร้าน` is the OWNER, the
 * third system role every shop is born with since server migration 0019 — the
 * same words every refusal already uses for who can fix a permission.
 *
 * UNKNOWN IS ITS OWN LABEL, not a guess. A token whose role this build cannot read
 * (null) is shown as unknown rather than defaulted to either role — the same
 * fail-honest reading `readTokenRole` gives, since nothing is authorised on this
 * value and a wrong label is worse than an honest "not known".
 *
 * A CODE THIS BUILD DOES NOT KNOW IS SHOWN AS ITSELF. Since 0019 a shop may mint
 * its own roles; their display NAME is the shop's own text and does not travel on
 * the roster yet (the five-key payload is unchanged), so the code is the truest
 * thing this screen holds. Filed with the role-management screen (OPEN_ITEMS).
 */
export function roleLabelOf(role: string | null): string {
  if (role === "owner") return "เจ้าของร้าน";
  if (role === "admin") return "ผู้ดูแลระบบ";
  if (role === "staff") return "พนักงาน";
  if (role === null) return "ไม่ทราบสิทธิ์";
  return role;
}

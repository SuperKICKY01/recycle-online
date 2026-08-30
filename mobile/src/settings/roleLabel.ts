/**
 * THE THAI LABEL FOR A ROLE — ONE place, so the account profile and any future
 * reader cannot drift on what "admin" is called on screen.
 *
 * `ผู้ดูแลระบบ` is the SERVER'S OWN word for the admin role — it is the message
 * `auth.require_admin` returns and the word the settings and send-path refusals
 * use (`บัญชีนี้ไม่มีสิทธิ์… ให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ`). Using anything else
 * here would tell an owner their account is one thing while every refusal names
 * another. `พนักงาน` is staff.
 *
 * UNKNOWN IS ITS OWN LABEL, not a guess. A token whose role this build cannot read
 * (DeviceRole null) is shown as unknown rather than defaulted to either role — the
 * same fail-honest reading `readTokenRole` gives, since nothing is authorised on
 * this value and a wrong label is worse than an honest "not known".
 */
import type { DeviceRole } from "../session/deviceRole.js";

export function roleLabelOf(role: DeviceRole): string {
  if (role === "admin") return "ผู้ดูแลระบบ";
  if (role === "staff") return "พนักงาน";
  return "ไม่ทราบสิทธิ์";
}

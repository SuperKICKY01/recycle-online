/**
 * THE ADD-SELLER FORM'S OUTWARD BOUNDARY, pure. PURE TypeScript — no React
 * Native, no Expo, no node — so the headless proof drives exactly what the
 * phone runs, which nothing under `app/` can be
 * (`tsconfig.node.json` has `rootDir: "src"`).
 *
 *   OUT  what the operator has typed becomes a `LocalSellerDraft`.
 *
 * There is no inward boundary here any more. A seller created at the weighbridge
 * is written LOCALLY, consuming a reserved code, and reaches the picker as a
 * `LocalSeller` through its own store (`sync/localSeller.ts`) — never narrowed
 * out of a server response. The field narrowing that keeps an id-card number off
 * the picker's list is done by the union at read time
 * (`cart/pickerSellers.ts`, which offers five fields and no fourth axis of
 * identity), not by a function here.
 */
import type { LocalSellerDraft } from "../sync/localSeller.js";

/**
 * WHAT THE TEXT BOXES HOLD. Every field is a plain `string`, because that is
 * what a `TextInput` gives you and pretending otherwise pushes the empty-vs-absent
 * decision out to the view.
 *
 * ===========================================================================
 * THERE IS NO `code`, AND ITS ABSENCE IS THE MECHANISM, NOT A REMINDER
 * ===========================================================================
 * A seller created offline spends a RESERVED code the server minted for this
 * device (`sync/localSeller.ts`), so there is nothing for a person to type: the
 * code comes from the reservation the create binds, not from this form. A code
 * box would be a dead input whose value nothing reads — a client whose screen
 * and whose request disagree. So there is no field, and `localSellerDraftFrom`
 * has no code to carry.
 *
 * ===========================================================================
 * THERE IS NO `grade`, AND ITS ABSENCE IS ALSO THE MECHANISM
 * ===========================================================================
 * A seller's grade selects which product price tier the yard pays at. ROADMAP
 * D1 settled that a yard phone must not re-price the shop, and a grade picker at
 * the weighbridge is re-pricing wearing a different label — pick grade A instead
 * of D and the same load is paid at the top tier.
 *
 * So there is no field here to put one in, and `localSellerDraftFrom` sends
 * `grade: null`. A rule stated in a comment is a rule somebody can forget; a
 * field that does not exist cannot be filled in. The designed path for a
 * grade-less seller is not a degradation: the bill parks with a named,
 * resolvable 424 (`seller_grade_unset`) telling the office to set the grade, and
 * `SellerCreate` on the server records in its own comment why grade is optional
 * and NOT defaulted — guessing one would quote a real price the yard pays cash
 * against (`lessons/fallback-default-is-a-wrong-number.md`).
 */
export interface SellerFormFields {
  name: string;
  phone: string;
  id_number: string;
  address: string;
  vehicle_no: string;
}

export const BLANK_SELLER_FORM: SellerFormFields = {
  name: "",
  phone: "",
  id_number: "",
  address: "",
  vehicle_no: "",
};

/**
 * May this be sent at all? `name` is the only required field, and that is the
 * server's own decision (`SellerCreate.name` has no default) rather than a
 * relaxation invented here.
 *
 * Trimmed, so a field holding three spaces is not "filled in".
 */
export function sellerFormReady(form: SellerFormFields): boolean {
  return form.name.trim().length > 0;
}

/**
 * BLANK MEANS ABSENT. A form leaves an empty string behind on every box the
 * operator did not fill in, and `LocalSellerDraft`'s optional fields are
 * `string | null` — so a blank box becomes `null`, not `""`. Trimmed, so a field
 * holding only spaces is treated as blank.
 */
const nullIfBlank = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * The typed form as a local-first draft. `grade` is `null` unconditionally
 * because this form offers no grade field (ROADMAP D1, above); nothing else here
 * invents a value the operator did not type.
 */
export function localSellerDraftFrom(form: SellerFormFields): LocalSellerDraft {
  return {
    name: form.name.trim(),
    phone: nullIfBlank(form.phone),
    grade: null,
    id_number: nullIfBlank(form.id_number),
    address: nullIfBlank(form.address),
    vehicle_no: nullIfBlank(form.vehicle_no),
  };
}

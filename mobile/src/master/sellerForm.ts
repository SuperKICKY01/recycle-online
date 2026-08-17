/**
 * THE ADD-SELLER FORM'S TWO BOUNDARIES, both of them pure. PURE TypeScript — no
 * React Native, no Expo, no node — so the headless proof drives exactly what the
 * phone runs, which nothing under `app/` can be
 * (`tsconfig.node.json` has `rootDir: "src"`).
 *
 *   OUT  what the operator has typed becomes a `SellerDraft`.
 *   BACK what the server created becomes a row the picker can list.
 *
 * Neither is bookkeeping. Each one carries a rule that is invisible at the call
 * site and expensive to get wrong, and both are stated below.
 */
import type { CreatedSeller, SellerDraft } from "./createSeller.js";
import type { MasterSeller } from "./types.js";

/**
 * WHAT THE TEXT BOXES HOLD. Every field is a plain `string`, because that is
 * what a `TextInput` gives you and pretending otherwise pushes the empty-vs-absent
 * decision out to the view.
 *
 * ===========================================================================
 * THERE IS NO `grade`, AND ITS ABSENCE IS THE MECHANISM, NOT A REMINDER
 * ===========================================================================
 * A seller's grade selects which product price tier the yard pays at
 * (server/app/master.py, `_seller_payload`: "Seller grade selects which
 * product_prices tier applies"). ROADMAP D1 settled that a yard phone must not
 * re-price the shop, and a grade picker at the weighbridge is re-pricing wearing
 * a different label — pick grade A instead of D and the same load is paid at the
 * top tier.
 *
 * The server still ACCEPTS a grade from a staff caller on create; that hole is a
 * later server phase's. What closes it on this side is that there is no field
 * here to put one in, so `sellerDraftFrom` has nothing to send and the key is
 * absent from the request body. A rule stated in a comment is a rule somebody
 * can forget; a field that does not exist cannot be filled in.
 *
 * The designed path for a grade-less seller already exists and is not a
 * degradation: the bill parks with a named, resolvable 424
 * (`seller_grade_unset`) telling the office to set the grade, and `SellerCreate`
 * records in its own comment why grade is optional and NOT defaulted — guessing
 * one would quote a real price the yard pays cash against.
 */
export interface SellerFormFields {
  name: string;
  code: string;
  phone: string;
  id_number: string;
  address: string;
  vehicle_no: string;
}

export const BLANK_SELLER_FORM: SellerFormFields = {
  name: "",
  code: "",
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
 * BLANK MEANS ABSENT, AND ABSENT IS NOT THE SAME AS EMPTY.
 *
 * `createSeller.ts` deliberately normalises nothing: it sends an empty string as
 * an empty string, and the server refuses it at `min_length=1`. That is the
 * right rule THERE — a client that quietly discards what somebody typed is a
 * client whose screen and whose request disagree — and it makes this function
 * load-bearing, because a form leaves blank boxes behind on every field the
 * operator did not fill in.
 */
const absentIfBlank = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * The typed form as a draft.
 *
 * ===========================================================================
 * THE `code` LINE DECIDES WHICH OF TWO OPPOSITE SENTENCES A 409 PRODUCES
 * ===========================================================================
 * `SellerApi.createSeller` reads `suppliedCode = draft.code !== undefined` once,
 * before the request leaves, and that single boolean is the whole discriminator
 * between `duplicate_code` ("that code is taken, pick another") and
 * `code_assignment_failed` ("the server could not mint one, type one yourself").
 * They are opposite instructions.
 *
 * So a blank box MUST become `undefined` and must never become `""`. Sending
 * `code: ""` would be wrong twice over: the server refuses it at `min_length=1`,
 * which lands the operator on `invalid` — a sentence about bad data — for the
 * entirely normal act of leaving the code blank; and if that refusal were ever a
 * 409 instead, `suppliedCode` would be TRUE and somebody who typed nothing would
 * be told the code they never typed is taken. Both are
 * lessons/correct-classification-can-still-render-as-an-error.md's wrong
 * instruction, produced here, one layer before the classification everyone
 * inspects.
 *
 * The same reading is what makes leaving it blank SAFE at the weighbridge: the
 * server assigns a code, which is the whole of ROADMAP D2 — nobody with a truck
 * waiting has to invent a unique string.
 */
export function sellerDraftFrom(form: SellerFormFields): SellerDraft {
  return {
    name: form.name.trim(),
    code: absentIfBlank(form.code),
    phone: absentIfBlank(form.phone),
    id_number: absentIfBlank(form.id_number),
    address: absentIfBlank(form.address),
    vehicle_no: absentIfBlank(form.vehicle_no),
  };
}

/**
 * THE ROW THE SERVER CREATED, NARROWED TO WHAT THE DEVICE MAY HOLD.
 *
 * FIELD BY FIELD, NEVER A SPREAD, and that is the entire content of this
 * function. `CreatedSeller` carries `id_number`, `address` and `vehicle_no`;
 * `MasterSeller` has no such columns and neither does `cached_sellers` —
 * proveSellerCreate's C6 proves the leak is unrepresentable for the REFRESH
 * path, where the device is handed the server's list.
 *
 * Creating a seller opens a SECOND path by which those three values arrive in
 * the app, and TypeScript's structural typing would not stop them: an object
 * carrying extra properties is assignable to `MasterSeller`, so
 * `const s: MasterSeller = created` compiles, puts an ID card number into the
 * picker's list, and hands it to `saveSellers`. Two green proofs do not cover
 * the seam between them (lessons/two-green-proofs-do-not-cover-the-seam.md);
 * this is the seam, and naming the five fields is what closes it.
 */
export function pickableSeller(created: CreatedSeller): MasterSeller {
  return {
    id: created.id,
    code: created.code,
    name: created.name,
    phone: created.phone,
    grade: created.grade,
  };
}

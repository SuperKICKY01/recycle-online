/**
 * @recycle/promptpay — the PromptPay QR payload, as a pure function.
 *
 * ONE place a PromptPay payload is built for every Recycle Online client, the
 * shared-TS pattern @recycle/shop-time set. Pure TypeScript — no clock, no
 * network, no I/O, no device API, no randomness — so the headless proof
 * exercises exactly the code the device runs.
 *
 * NOT VERIFIED AGAINST A REAL BANK.
 * ================================
 * The CRC ALGORITHM here is checked against its own published check value in the
 * proof (CRC-16/CCITT-FALSE, check 0x29B1 over "123456789"; see provePromptPay).
 * The PAYLOAD FORMAT — the EMVCo tag numbers, the PromptPay AID, the mobile-proxy
 * shape, currency 764, country TH, and that PromptPay's CRC covers the payload
 * including "6304" — is DERIVED from the EMVCo Merchant-Presented-Mode QR spec and
 * the Bank of Thailand Thai QR standard as understood here. It has NOT been
 * confirmed against a bank-issued test vector. A payload this function emits is
 * SELF-CONSISTENT (it parses cleanly by an independent parser and its CRC
 * recomputes); that is a different claim from CORRECT. The last verification layer
 * is a human scanning a sample with a real banking application. Until that has
 * happened for a given field, treat every payload as UNVERIFIED.
 *
 * THE PAYEE IS A THAI MOBILE NUMBER — the only payee proxy the device holds today.
 * seller_bank_accounts.promptpay_id (STRUCTURE.md 2.4, batch D) does not exist yet,
 * and id_number is deliberately not cached on the device; the seller's phone
 * (cached_sellers.phone) is what is available. This function therefore builds a
 * mobile-number PromptPay payload and nothing else. A national-id or e-wallet
 * proxy (tag 29 sub-tags 02 / 03) is a later concern and is not built or guessed
 * here.
 *
 * THE REFUSAL CONTRACT (the whole reason this is a function and not a template):
 *   - The amount is NEVER computed here. It arrives as the already-quantized
 *     decimal string the ledger produced, and anything that is not exactly that
 *     shape is REFUSED, never stripped, rounded, reformatted, or parsed to a
 *     number and back. Silently cleaning a grouped "1,144.00" is how a wrong
 *     number becomes plausible.
 *   - The payee is RESOLVED or the function REFUSES. There is no fallback number,
 *     no partial payload, no empty payee field. A default payee would be a default
 *     identity — the identity of whoever receives the money.
 *   - A refusal returns NO payload fragment: it is a typed code and nothing a
 *     later caller could render as a QR.
 *   - Every refusal is a distinct code, because "bad phone", "bad amount shape",
 *     "amount not positive" and "payee missing" are four different repairs for the
 *     operator, not one boolean. (defensive-coding rule 1: a failure to build is
 *     not one undifferentiated "no".)
 */

/**
 * Why the function refused. Four causes, four repairs — never collapsed to a
 * boolean, so the caller can word a message the operator can act on.
 */
export type PromptPayRefusalCode =
  | "payee_missing" // no phone at all (null / undefined / empty)
  | "bad_phone" // a phone was given but is not a canonical Thai mobile number
  | "bad_amount_shape" // the amount is missing or not the ledger's quantized shape
  | "amount_not_positive"; // the amount is the right shape but is zero

/**
 * The result. On success, `payload` is the complete QR string with its CRC already
 * in place — no caller ever appends anything. On refusal, only a code: there is no
 * half-built payload for a later caller to render (the no-leak property the proof
 * asserts negatively).
 */
export type PromptPayResult =
  | { readonly ok: true; readonly payload: string }
  | { readonly ok: false; readonly code: PromptPayRefusalCode };

/** What the builder needs. Both fields are typed to admit the messy runtime
 *  reality (a null phone off a seller row, a missing amount) and refuse it with a
 *  code, rather than trust a caller's types. */
export interface PromptPayPhoneRequest {
  /** A Thai mobile number in canonical local form, e.g. "0812345678". */
  readonly phone: string | null | undefined;
  /** The ledger's quantized money string, e.g. "195.00". Never a number. */
  readonly amount: string | null | undefined;
}

// The PromptPay Application ID carried in the Merchant Account Information
// template (EMVCo tag 29, sub-tag 00). Constant for the mobile/national-id proxy.
const PROMPTPAY_AID = "A000000677010111";

// A Thai mobile number, canonical local form: a leading 0 then nine digits. The
// only form accepted; a number with separators, spaces, or a +66 prefix is an
// input error and is REFUSED (bad_phone), not cleaned. Normalising display input
// is the caller's job, kept out of the money path on purpose.
const THAI_MOBILE = /^0\d{9}$/;

// The ledger's quantized money string: an integer part of one to twelve digits
// (numeric(14,2) allows at most twelve before the point), no leading zeros beyond
// a bare "0", a dot, then exactly two digits. No sign, no thousands separator.
const LEDGER_AMOUNT = /^(0|[1-9]\d{0,11})\.\d{2}$/;

/**
 * EMVCo TLV: a two-character tag id, a two-digit length, then the value. Every
 * value this module builds is at most 37 characters (tag 29's own value), and the
 * amount is capped at 15 by LEDGER_AMOUNT, so the length is always two digits —
 * padStart is correct for every field this module produces.
 */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

/**
 * CRC-16/CCITT-FALSE (a.k.a. CRC-16/IBM-3740): polynomial 0x1021, initial value
 * 0xFFFF, no input/output reflection, no final XOR. MSB-first, over the ASCII
 * bytes of the input. Rendered as four UPPERCASE hex characters. This is computed
 * here and never trusted from a caller.
 */
function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * A canonical Thai mobile number to the 13-digit PromptPay proxy: drop the leading
 * 0, prepend "0066" (the international form "66" + national number, left-padded
 * with "00" to 13 digits). "0812345678" -> "0066812345678".
 */
function mobileProxy(phone: string): string {
  return "0066" + phone.slice(1);
}

/**
 * Build the PromptPay QR payload for paying `amount` to the mobile number `phone`,
 * or refuse with a code. Pure: same inputs, same output, no side effects.
 */
export function promptPayPhonePayload(req: PromptPayPhoneRequest): PromptPayResult {
  const { phone, amount } = req;

  // The payee: resolved or refused, never defaulted.
  if (phone === null || phone === undefined || phone === "") {
    return { ok: false, code: "payee_missing" };
  }
  if (!THAI_MOBILE.test(phone)) {
    return { ok: false, code: "bad_phone" };
  }

  // The amount: the ledger's exact shape, or refused. No arithmetic on it.
  if (amount === null || amount === undefined || !LEDGER_AMOUNT.test(amount)) {
    return { ok: false, code: "bad_amount_shape" };
  }
  // Positive-or-refused, decided by inspection rather than by parsing to a number:
  // a shape-valid amount is positive exactly when it carries a non-zero digit, and
  // it can never be negative (LEDGER_AMOUNT admits no sign). So "0.00" is the only
  // non-positive value that reaches here, and it is refused before anything is built.
  if (!/[1-9]/.test(amount)) {
    return { ok: false, code: "amount_not_positive" };
  }

  // Tag 29 — Merchant Account Information (PromptPay): the AID, then the mobile proxy.
  const merchant = tlv("00", PROMPTPAY_AID) + tlv("01", mobileProxy(phone));

  // The payload body, tags in ascending order. Tag 01 is the Point of Initiation
  // Method: "12" (dynamic) because an amount is present — a QR for one payment,
  // not a reusable static code.
  const body =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", "12") + // Point of Initiation Method — dynamic (an amount is present)
    tlv("29", merchant) + // Merchant Account Information (PromptPay)
    tlv("53", "764") + // Transaction Currency — THB, ISO 4217 numeric
    tlv("54", amount) + // Transaction Amount — the ledger's string, verbatim
    tlv("58", "TH"); // Country Code

  // The CRC (tag 63, length 04) is computed over the body PLUS "6304" and appended
  // in place, so the returned string is complete and no caller ever appends it.
  const beforeCrc = body + "6304";
  return { ok: true, payload: beforeCrc + crc16CcittFalse(beforeCrc) };
}

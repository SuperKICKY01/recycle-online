/**
 * @recycle/promptpay — the PromptPay QR payload, as a pure function with its CRC.
 *
 * IMPORT THIS. DO NOT PORT IT — the same instruction @recycle/shop-time carries,
 * and for the same reason: a second implementation (the desktop slip, another
 * client) would be a second behaviour, and the two would drift at exactly the
 * boundary neither author tested. A wrong payee or a wrong CRC is real money.
 *
 * WHY A BARREL: the package's public surface and its file layout are different
 * things, so a consumer's specifier need not move when a second module arrives.
 * `export *` rather than a named list, on purpose — everything promptPay.ts exports
 * is public, so a named list here could only drift from it, silently.
 */
export * from "./promptPay.js";

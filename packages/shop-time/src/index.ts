/**
 * @recycle/shop-time — shop-local date and time for every Recycle Online client.
 *
 * IMPORT THIS. DO NOT PORT IT. That instruction is the whole reason this
 * package exists, and it INVERTS what shopTime.ts's own NEXT CONSUMER block
 * still says: that block was written when there was nowhere to import from, so
 * it asks the desktop to PORT the offset constant, the brand and the ordering
 * rule. There is somewhere now. A second implementation in Electron would be a
 * second behaviour, and the two would drift at exactly the boundary neither
 * author tested — which is what that block was guarding against and what this
 * package removes the need for.
 *
 * The paragraph inside shopTime.ts is deliberately UNEDITED: this phase is a
 * move, and moving the file byte-identical keeps every `shopTime.ts:NN` line
 * reference in ARCHITECTURE.md, PROJECT_STATUS.md and SRS_MAP.md resolving.
 * Correcting it is queued in OPEN_ITEMS.md rather than smuggled into a move.
 *
 * WHY A BARREL AT ALL, rather than pointing the package at shopTime.ts: the
 * package's PUBLIC SURFACE and its FILE LAYOUT are different things, and the
 * consumers' specifier should not have to move when the second module arrives.
 *
 * `export *` rather than a named list, on purpose. Everything shopTime.ts
 * exports is public by design — it is THE client authority on the timezone, the
 * year and the format — so a named list here could only ever drift from it,
 * silently, by someone adding an export there and not here.
 */
export * from "./shopTime.js";

/**
 * @recycle/shop-time — the shared package.
 *
 * COMMIT 1 OF P1.12 CONTAINS NOTHING REAL ON PURPOSE. This package exists so
 * that the WORKSPACE and the four resolution paths can be proven while nothing
 * of value has moved. `shopTime.ts` arrives in commit 2, and if Metro breaks
 * then, the split is what names which change did it.
 *
 * WHY THE SPLIT: lessons/metro-file-map-nesting.md records a failure that is
 * SILENT — imports resolve to nothing rather than erroring — so a combined
 * change would leave "the workspace" and "the move" indistinguishable as
 * causes.
 *
 * THIS PACKAGE SHIPS COMPILED dist/ + .d.ts, NOT SOURCE. Node's type-stripping
 * would run the .ts directly on Node 24, but it is version-dependent and this
 * repository pins no Node version; the next consumer is an Electron main
 * process (desktop/) that nobody has measured. One artifact, consumed
 * identically by tsc, by node's ESM loader and by Metro.
 */

/**
 * The trivial value. Its only job is to be imported by exactly one existing
 * file in mobile/ so that a failure to resolve is a failure to build or to run.
 *
 * REMOVED IN COMMIT 2 once shopTime.ts is the real export.
 */
export const SHARED_PACKAGE_MARKER = "@recycle/shop-time";

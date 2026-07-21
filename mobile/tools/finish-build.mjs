/**
 * Marks dist/ as ESM.
 *
 * The root package.json cannot carry "type": "module" — Expo's metro.config.js
 * and babel.config.js are CommonJS and node would refuse to load them. But the
 * headless proofs are ESM (import.meta.url, top-level await), so dist/ gets its
 * own package.json saying so. Node reads the nearest package.json, so files
 * under dist/ are ESM and everything above stays CommonJS.
 */
import { writeFileSync } from "node:fs";

writeFileSync(
  new URL("../dist/package.json", import.meta.url),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
);

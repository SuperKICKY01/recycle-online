/**
 * THE DESKTOP'S BOUNDARY (ADVISOR-DECIDED D-1, and P1.13's negative half).
 *
 *   npm run prove:boundary
 *
 *   B1 desktop/ is NOT a member of the root npm workspaces.
 *   B2 the ROOT lockfile holds none of the desktop's packages (electron, react-dom, esbuild),
 *      read as JSON -- its package keys, not a text search.
 *   B3 desktop/ has its OWN lockfile, and it pins electron at the declared version.
 *   B4 the shared date logic is consumed BY PATH (file:../packages/shop-time).
 *   B5 the Buddhist-era offset's digits do not appear in desktop/src: the offset lives in
 *      packages/shop-time ONLY (P1.13 DONE WHEN). Positive control: the same search finds them
 *      in packages/shop-time/src. The needle is BUILT at run time so this file cannot match itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { check, DESKTOP_ROOT, finish, header } from "./harness";

const REPO = join(DESKTOP_ROOT, "..");

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

function filesContaining(dir: string, needle: string): string[] {
  return filesUnder(dir).filter((f) => readFileSync(f, "utf8").includes(needle));
}

const BE_DIGITS = ["5", "4", "3"].join("");

void finish("PROVE_BOUNDARY", async () => {
  header("B1-B4 the desktop's own package, outside the root workspaces");
  const root = json(join(REPO, "package.json"));
  const workspaces = (root["workspaces"] as string[] | undefined) ?? [];
  check("B1 the root workspaces do not name desktop/",
    !workspaces.some((w) => w === "desktop" || w.startsWith("desktop/") || w === "*"), JSON.stringify(workspaces));

  const rootLock = json(join(REPO, "package-lock.json"));
  const rootKeys = Object.keys((rootLock["packages"] as Record<string, unknown> | undefined) ?? {});
  const leaked = rootKeys.filter((k) => /(^|\/)node_modules\/(electron|react-dom|esbuild)$/.test(k) || k.startsWith("desktop"));
  check("B2 the ROOT lockfile has no electron, react-dom, esbuild or desktop/ entry",
    leaked.length === 0 && rootKeys.length > 0, `root lock keys=${String(rootKeys.length)} leaked=${JSON.stringify(leaked)}`);

  const pkg = json(join(DESKTOP_ROOT, "package.json"));
  const devDeps = pkg["devDependencies"] as Record<string, string>;
  const lock = json(join(DESKTOP_ROOT, "package-lock.json"));
  const lockElectron = ((lock["packages"] as Record<string, { version?: string }>)["node_modules/electron"])?.version;
  check("B3 desktop/package-lock.json pins electron at the declared version",
    lockElectron !== undefined && lockElectron === devDeps["electron"], `lock=${String(lockElectron)} declared=${String(devDeps["electron"])}`);

  const deps = pkg["dependencies"] as Record<string, string>;
  check("B4 @recycle/shop-time is consumed BY PATH", deps["@recycle/shop-time"] === "file:../packages/shop-time",
    String(deps["@recycle/shop-time"]));

  header("B5 the Buddhist-era offset is written in ONE place");
  const control = filesContaining(join(REPO, "packages", "shop-time", "src"), BE_DIGITS);
  check("B5 control: the search finds the offset in packages/shop-time/src", control.length > 0, control.join(", "));
  const hits = filesContaining(join(DESKTOP_ROOT, "src"), BE_DIGITS);
  check("B5 desktop/src does not contain the offset's digits", hits.length === 0, hits.join(", "));
});

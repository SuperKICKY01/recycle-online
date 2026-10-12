// Bundle the desktop with esbuild. One build, four outputs:
//   dist/main.cjs        Electron main process (node, CommonJS; `electron` stays external)
//   dist/preload.cjs     the preload bridge (node, CommonJS; sandboxed preload)
//   dist/renderer/       the React renderer (browser IIFE) + index.html, served at app://recycle
//   dist/proof/*.cjs     every proof (node, CommonJS)
// Type checking is NOT done here -- `npm run typecheck` is the compiler's job and a separate step.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "renderer"), { recursive: true });

const node = { bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "warning" };

await build({ ...node, entryPoints: [join(root, "src/main/main.ts")], outfile: join(dist, "main.cjs") });
await build({ ...node, entryPoints: [join(root, "src/preload/preload.ts")], outfile: join(dist, "preload.cjs") });
await build({
  bundle: true, platform: "browser", format: "iife", target: "chrome128", logLevel: "warning",
  entryPoints: [join(root, "src/renderer/main.tsx")], outfile: join(dist, "renderer", "app.js"),
  define: { "process.env.NODE_ENV": '"production"' },
});
copyFileSync(join(root, "src/renderer/index.html"), join(dist, "renderer", "index.html"));
copyFileSync(join(root, "src/renderer/app.css"), join(dist, "renderer", "app.css"));

const proofs = readdirSync(join(root, "src/proof")).filter((f) => /^prove[A-Z]\w*\.ts$/.test(f));
for (const f of proofs) {
  await build({ ...node, entryPoints: [join(root, "src/proof", f)], outfile: join(dist, "proof", f.replace(/\.ts$/, ".cjs")) });
}
console.log(`desktop build: main, preload, renderer, ${proofs.length} proof(s)`);

// Metro config.
//
// One job: teach Metro to resolve TypeScript's ESM import specifiers.
//
// The engine under src/ is compiled two ways — by tsc into dist/ for the
// headless node proofs, and by Metro into the app bundle. Node's ESM loader
// requires a file extension at runtime, so the source must write
// `import ... from "./schema.js"` even though the file on disk is schema.ts.
// tsc understands that convention; Metro does not, and fails with "None of
// these files exist: schema.js(.ts|.tsx|…)" while schema.ts sits right there.
//
// Dropping the extensions is not an option: it would break `node dist/...`.
// So relative ".js" specifiers get retried without the extension, which lets
// Metro's normal platform-aware resolution find the .ts/.tsx file.
//
// Note also that this project is deliberately ONE npm package. Nesting a
// second package.json underneath it made Metro's file map stop indexing files
// that exist on disk, and every import silently failed to resolve.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// THE SHARED PACKAGE SITS OUTSIDE METRO'S PROJECT ROOT, AND ONLY THE FILE MAP
// NEEDS TEACHING (P1.12). RESOLUTION ALREADY WORKS: disableHierarchicalLookup
// is false, so metro-resolver walks up from the importing file trying
// <dir>/node_modules at every level until the filesystem root, which reaches
// <repo root>/node_modules/@recycle/shop-time on its own
// (metro-resolver/src/resolve.js:144-165, metro 0.83.7).
//
// What that walk does NOT do is INDEX a file outside projectRoot. That is the
// exact failure in lessons/metro-file-map-nesting.md, where fs.existsSync said
// true and context.doesFileExist said false about the same absolute path, and
// every import silently resolved to nothing. watchFolders is the fix for THAT,
// and it is the only knob this phase moves.
//
// DELIBERATELY NOT SET: nodeModulesPaths and disableHierarchicalLookup. That
// pair is the R4 row of the same lesson - it made ../src resolve and broke
// every NESTED dependency - and the nesting it breaks is live in this tree:
// node_modules/expo/node_modules/expo-asset, and @expo/metro-config itself at
// node_modules/expo/node_modules/@expo/metro-config.
//
// The repo root declares workspaces ["packages/*"] and NOT "mobile", which is
// what keeps that pair off. MEASURED 2026-08-18: @expo/metro-config's
// getWatchFolders and getModulesPaths both branch on
// getMetroServerRoot(projectRoot) !== projectRoot, and resolveWorkspaceRoot
// only reports a root when the project ITSELF is a member. With mobile out of
// the list it returns null, so getDefaultConfig leaves both at [] - measured
// identical before and after the root package.json existed. Adding "mobile" to
// that list would switch BOTH on automatically, and move Metro's server root.
const workspaceRoot = path.resolve(__dirname, "..");
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
];

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName.slice(0, -".js".length), platform);
    } catch {
      // Fall through: it really was a .js file on disk.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;

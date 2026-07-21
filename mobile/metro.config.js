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

const config = getDefaultConfig(__dirname);

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

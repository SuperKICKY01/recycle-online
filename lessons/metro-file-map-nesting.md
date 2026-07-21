# When a resolver says a file is missing, ask the resolver — not the OS

**Context.** Phase 2c-1 put the Expo app in `mobile/device/`, its own npm
package nested inside the engine package at `mobile/`, with Metro reaching the
engine through `watchFolders`. Every `../src/...` import failed to resolve. The
files were plainly there.

## The diagnostic that mattered

The instinct is to check the path — retype it, `ls` the directory, adjust
`watchFolders`. That burned two runs and moved nothing. What broke it open was
instrumenting Metro's own resolver and asking **both** layers the same question
about the same absolute path:

```
fs.existsSync(abs)          = true
context.doesFileExist(abs)  = false      <- the answer that mattered
blockList hits              = false,false
```

That single line reclassifies the whole problem. It is not a wrong path, not a
typo, not an exclusion rule — the file was never **indexed into Metro's file
map**. Bundlers, module resolvers, watchers and test runners all resolve against
their own index, not the filesystem. So when one claims a file does not exist,
the useful question is never "is it on disk"; it is "is it in your index, and
why not".

## The ledger, and the wrong cause it saved us from

Four runs, one knob at a time:

| run | watchFolders | node_modules guards | parasitic Expo tree | `../src` |
|-----|--------------|---------------------|---------------------|----------|
| R1  | `../src`     | on                  | present             | FAIL     |
| R2  | `..`         | on                  | present             | FAIL     |
| R3  | `../src`     | on                  | removed             | resolved |
| R4  | `../src`     | **off**             | removed             | FAIL     |

After R3 the conclusion looked obvious and was announced with confidence: a
stray Expo install in the parent's `node_modules` (left by an earlier
`npm install expo-sqlite` used only for typechecking) had been shadowing the
app's dependency tree, and removing it fixed the resolution.

R4 killed that. With the parasite still gone, merely turning off
`disableHierarchicalLookup` + explicit `nodeModulesPaths` broke resolution
again. The differentiator was the node_modules guards; the parasite removal was
a coincidence sitting next to the real variable. **One run would have pinned the
wrong cause**, and the "fix" — deleting a directory — would have appeared to
work while the actual mechanism sat untouched, ready to return.

Nor were the guards a fix: they made `../src` resolve but broke every nested
dependency (`expo-asset` lives at `node_modules/expo/node_modules/expo-asset`).
Neither configuration was viable, which is what forced the real conclusion.

**Rule (method).** Keep a ledger of every run — what changed, what happened —
and require a candidate cause to explain *every* row, not the most recent one.
Change one knob per run. A green run immediately after a change is correlation;
the disproof is what makes it a cause. Same discipline as
[[concurrency-tests-need-a-barrier]] and [[schema-audit]]: a passing result is
not evidence that your explanation is right.

**Rule (structure).** Do not nest one npm package inside another. `mobile/` is
ONE package that *is* the Expo app, with `src/` inside Metro's project root. No
`watchFolders`, no resolver guards, nothing to get subtly wrong. Nesting is what
put the file outside the index in the first place.

## The structural consequence: TS ESM specifiers vs Metro

Collapsing to one package means one `src/` compiled two ways — by `tsc` into
`dist/` for the headless node proofs, and by Metro into the app bundle. Those
two disagree about import specifiers:

- Node's ESM loader **requires** a file extension at runtime, so the source must
  write `import { X } from "./schema.js"` even though the file is `schema.ts`.
  `tsc` understands that convention.
- Metro does not. It fails with `None of these files exist: schema.js(.ts|.tsx|…)`
  while `schema.ts` sits right beside it.

Dropping the extensions is not an option — it breaks `node dist/...`. So
`metro.config.js` retries relative `.js` specifiers without the extension and
lets Metro's normal platform-aware resolution find the `.ts`. Ten lines, and the
comment explains why, because the obvious "cleanup" of deleting it would break
the proofs and not the app — a change that looks safe and passes the app build.

Related: the root `package.json` cannot declare `"type": "module"` (Expo's
`metro.config.js` and `babel.config.js` are CommonJS), so `dist/` gets its own
`package.json` saying `{"type":"module"}` instead.

**Where proven.** Phase 2c-1. `mobile/metro.config.js` carries the shim and the
nesting warning; `mobile/tsconfig.json` and `mobile/tsconfig.node.json` are the
two programs sharing `src/`; `mobile/tools/finish-build.mjs` marks `dist/` as
ESM. Verified by `npx expo export --platform ios` bundling clean and both node
proofs still passing, then by the slice running on a real iPhone.

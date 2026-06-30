---
name: Adding a web lib to the project-references build
description: Why a copied React lib that uses import.meta.env breaks tsc --build, and the two settings that fix it.
---

When you add a new shared web library under `lib/` (e.g. a copied auth/web hook package) and reference it from an artifact's tsconfig, the workspace `tsc --build` (`pnpm run typecheck:libs`) fails unless the lib is set up as a proper composite project.

Two distinct failures, two fixes:

1. `Property 'env' does not exist on type 'ImportMeta'` — the lib uses `import.meta.env.BASE_URL` (Vite) but has no Vite types. Do **not** add `vite/client` to its `types`: `vite/client` is not resolvable from the repo root during the libs build. Instead ship a self-contained ambient decl in the lib's own `src` (e.g. `src/env.d.ts`) declaring `ImportMetaEnv` + `ImportMeta`. Keeps the package dependency-free.

2. `Referenced project '…' must have setting "composite": true` — any tsconfig listed under another project's `references` must be a composite project. Match the other shared libs: `composite: true`, `declarationMap: true`, `emitDeclarationOnly: true`, `outDir: dist`, `rootDir: src`.

**Why:** the storefront uses TypeScript project references; a referenced lib must emit declarations as a composite project, and the libs build runs from the root where Vite's ambient types aren't on the resolution path.

**How to apply:** whenever you copy/scaffold a new `lib/*` web package and wire it into an artifact's tsconfig references, set composite + emitDeclarationOnly and add a local `env.d.ts` if it touches `import.meta.env`.

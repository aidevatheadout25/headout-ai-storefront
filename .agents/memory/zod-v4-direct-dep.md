---
name: zod must be a direct dep to import zod/v4
description: Why importing "zod/v4" in api-server fails unless zod is added directly to its package.json
---

Importing `from "zod/v4"` (the v4 subpath) only resolves if the package lists
`zod` in its **own** `dependencies`. In this monorepo `@workspace/api-server`
depends on `@workspace/api-zod` and `@workspace/db` (which both use zod), but
that transitive presence is NOT enough — pnpm's strict node_modules means the
`zod/v4` subpath isn't visible to api-server until you add `"zod": "catalog:"`
to `artifacts/api-server/package.json` and run `pnpm install`.

**Why:** pnpm only hoists a package's declared deps into its own node_modules.
Transitive deps of workspace siblings are not importable directly.

**How to apply:** when a package starts importing a library it didn't before
(even one already used elsewhere in the repo), add it to that package's
`dependencies` (use `catalog:` to match the workspace-pinned version) before
expecting the import to typecheck/build.

# Headout AI Storefront

An internal registry and discovery layer for the tools, apps, skills, docs, plugins, and MCPs built at Headout — find what already exists, scope new ideas via a PM chat, and register your own back to the catalogue. Ported from an imported Next.js (Vercel/v0) project to a Vite + React artifact.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/storefront/` — the Vite + React frontend (the product). Routes in `src/App.tsx` (wouter), pages in `src/pages/`, ported components/lib/hooks/context under `src/`.
- `artifacts/storefront/src/compat/` — `next-link` + `next-navigation` shims emulating Next.js APIs on wouter (see Architecture decisions).
- `artifacts/storefront/src/index.css` — the app's plain-CSS styles (the original `globals.css`). Design tokens + Halyard fonts come from `artifacts/storefront/public/design-system/colors_and_type.css`, linked in `index.html`.
- `artifacts/storefront/src/lib/mockData.ts` (+ sibling `mock*.ts`) — in-memory catalogue data; the app has no database.
- `artifacts/api-server/src/routes/analyzeZep.ts` — the one ported API route (`POST /api/analyze-zep`), deterministic manifest → listing mapping.
- `.migration-backup/` — the original imported Next.js source, kept as the parity reference.

## Architecture decisions

- Ported from Next.js app-router to Vite + React via **compat shims**, not a component-by-component rewrite: `next/link` and `next/navigation` imports were `sed`-rewritten to `@/compat/*` shims built on wouter, so component bodies stay byte-identical to the original for visual + functional parity.
- `notFound()` / `redirect()` throw a sentinel `NotFoundError` caught by a class error boundary in `App.tsx`; the boundary resets on route change. Next redirect pages became wouter `<Redirect>`.
- No database — the catalogue is in-memory mock data held in React context (`src/context/AppContext.tsx`).
- The single API route is a self-contained Express route (no OpenAPI/codegen) because the client uses a plain `fetch` and already falls back to the same deterministic mapping if the call fails.

## Product

Internal catalogue for Headout-built tools/apps/skills/docs/plugins/MCPs: a home PM-style chat to find or scope tools, a filterable/searchable registry (tools + building blocks), tool detail pages, a register-a-tool chat flow (incl. Zeps manifest ingest), my-activity, and admin approvals + metrics. Member/Admin role switch governs the catalogue.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The design-system stylesheet is linked from `index.html` with a **relative** href (`./design-system/...`) so the `@font-face` relative `url()`s and the production base path resolve correctly — do not change it to a root-relative `/design-system/...`.
- The client copy of `src/lib/analyzeZep.ts` had its `ai`-package import stripped (only `mapManifestDeterministic` is used). Re-adding an `import ... from "ai"` will break the Vite build unless the package is installed.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

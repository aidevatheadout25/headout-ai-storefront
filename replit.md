# Headout AI Storefront

A **chat-first meta-catalogue** of the internal AI tools, apps, skills, docs, plugins, MCPs and Zeps built at Headout. The home page IS a single chat front door: describe a task and the concierge finds the existing internal tool that already does it (it routes, it never runs tools). If nothing fits, it points you at how to build (Zeps builder) or request one (Slack). A quiet "+ Add a tool" lets anyone paste a URL and the LLM infers the catalogue metadata.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (binds `PORT`)
- `pnpm --filter @workspace/storefront run dev` — run the Vite frontend (binds `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — retrieval-quality + no-match regression checks for the chat (runs against the seeded DB; registered as the `test` validation step)
- `pnpm run build` — typecheck + build all packages (needs `PORT` + `BASE_PATH`, injected by the platform)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server exec tsx src/lib/seed.ts` — (re)seed ~25 tools with embeddings (idempotent)
- Required env: `DATABASE_URL` (Postgres). Chat, tool inference, and capability checks all use the **Anthropic Replit integration** (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL` / `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, auto-provisioned — no manual key needed). Model: `claude-sonnet-4-6`. Embeddings need no key (local model).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vite + React, wouter routing
- API: Express 5
- DB: PostgreSQL + **pgvector** + Drizzle ORM
- Embeddings: local `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, 384-dim) — no API key
- Chat / metadata inference: Anthropic via Replit AI integration (`src/lib/anthropicClient.ts`, model `claude-sonnet-4-6`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (api-server), Vite (storefront)

## Where things live

- `artifacts/storefront/` — the Vite + React frontend (the product). Routes in `src/App.tsx` (wouter): `/` (home chat), `/registry` (browse), `/tools/:id` (detail); obsolete routes redirect to `/`.
- `artifacts/storefront/src/lib/api.ts` — the only data layer: `fetchTools`/`fetchTool`/`sendChat`/`addToolByUrl`, base `/api` (root-relative; the platform proxy routes it to the API server — no Vite proxy needed). Casts `ApiTool` → `Tool`.
- `artifacts/storefront/src/components/HomeChat.tsx` — the chat front door; `Sidebar.tsx` — read-only nav (Home + Browse catalogue only).
- `artifacts/storefront/src/index.css` — plain-CSS styles. Design tokens + Halyard fonts come from `artifacts/storefront/public/design-system/colors_and_type.css`, linked in `index.html`.
- `lib/db/src/schema/tools.ts` — the `tools` Drizzle table (incl. pgvector `embedding` column), exported via `@workspace/db`.
- `lib/db/src/schema/briefs.ts` — `briefs` + `builds` tables for the builder journey; push with `pnpm --filter @workspace/db run push`.
- `artifacts/api-server/src/routes/` — `tools.ts` (GET list/get, POST add-by-URL, **POST `:id/claim`**, **PATCH `:id`** owner/admin edit), `chat.ts` (POST chat), **`briefs.ts`** (POST /api/briefs, PATCH /api/briefs/:id, POST /api/scaffold, POST /api/builds/:id/verify-step, POST /api/builds/:id/submit-review). `lib/catalogue.ts` (cosine top-K search, plus `claimTool`/`updateTool`/`getToolRowById`/`hashManageToken`), `lib/chatAgent.ts` (concierge agent loop, incl. scope/brief/kill mode), `lib/inferTool.ts` (URL → metadata), `lib/embeddings.ts` (local model), `lib/seed.ts` + `lib/seedData.ts`.
- `artifacts/storefront/src/components/ToolManagePanel.tsx` — the owner claim/edit panel surfaced from `ToolDetailView`; `src/lib/manageTokens.ts` — per-tool manage-key storage (localStorage).
- `.migration-backup/` — the original imported Next.js source, kept as a historical reference (no longer the parity target).

## Architecture decisions

- **Chat-first, not search-first**: the home page is the chat; there is no search box and no three-door (find/build/request) model. The concierge agent does semantic search over the catalogue and routes to tools — it is explicitly a router, never a runner.
- **Postgres + pgvector is the source of truth** for the catalogue (not in-memory mock data, not React context). The old `AppContext` and all `mock*.ts` files were removed.
- **Embeddings run locally** (`@huggingface/transformers`) because neither the OpenAI nor Gemini Replit integrations expose an embeddings endpoint; weights are downloaded once and cached on disk.
- **Read-only browse, with owner upkeep**: no submit/build/approval/role-switch UI, and obsolete routes (`/submit`, `/build`, `/funnel`, `/requests`, `/admin/*`, etc.) redirect to `/`. The one write seam from the UI is **owner self-service**: a tool can be claimed and its key fields + lifecycle status edited from its detail page.
- **Owner-scoped edits without login**: claiming an unclaimed tool issues a one-time **manage key** (random token; only its sha256 hash is stored in `tools.manage_token_hash`). Edits (`PATCH /api/tools/:id`) require that manage key (`x-manage-token`) or an optional shared **admin key** (`x-admin-token` matching the `STOREFRONT_ADMIN_TOKEN` secret — when unset, the admin override is simply disabled). Edits re-embed the tool when search-relevant fields change so semantic search stays accurate.
- The client talks to the API with a plain `fetch` to root-relative `/api/...`; the platform proxy forwards to the api-server.

## Product

A single chat front door to find existing internal AI tools (apps, skills, docs, MCPs, plugins, scripts, slack-bots, zeps). On a match it shows inline tool cards that link to read-only detail pages; on no match it offers a Zeps build link and/or a Slack request link. A filterable/searchable read-only registry at `/registry` browses the full catalogue. "+ Add a tool" ingests a pasted URL and infers its metadata via the LLM.

**Builder journey** (full scope → ship flow): when a user has no catalogue match and says "let's scope it", the critique agent runs a multi-turn interview and produces either a requirements brief (editable `BriefCard`) or a kill recommendation (`KillCard`). Confirming the brief triggers a simulated repo scaffold (`ScaffoldCard`), a four-step builder checklist (`ChecklistCard` with per-step verify + help chips), a multi-stage simulated review sequence (`ReviewCard`), and real tool insertion into the catalogue with embeddings. The journey is tracked by `briefs` + `builds` DB tables; built tools get `source='built'` and are immediately findable via semantic search.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Scope-mode lifecycle

Entry: the client sets `inScopeMode=true` when the server returns `stage === "scope"` (user forked from the handoff chip). Exit: the server returns `stage === "brief"`, `"kill"`, or `"scope_exit"` (new — triggered by the `end_scope` tool when the user issues a mode-switch or exit request). On exit the client clears `inScopeMode` so the next message runs a normal catalogue search. The `scope_exit` stage is also handled in the conversation-restore path so a reloaded conversation never resurrects scope mode from a completed exit turn.

## Gotchas

- The design-system stylesheet is linked from `index.html` with a **relative** href (`./design-system/...`) so the `@font-face` relative `url()`s and the production base path resolve correctly — do not change it to a root-relative `/design-system/...`.
- Both Vite configs require `PORT` (and the storefront also `BASE_PATH`) at build/dev time — the platform injects these. Running `pnpm run build` bare will fail with "PORT/BASE_PATH environment variable is required"; pass them when building manually.
- `mockup-sandbox` is a scaffold artifact unrelated to this product; its build needs `PORT` and is expected to fail in a bare `pnpm run build` — ignore it.
- The first `/api/chat` (or seed) call after a cold start downloads the local embedding model weights from the HF hub (one-time, cached on disk), so it is noticeably slower than subsequent calls.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

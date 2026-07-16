# The Scaffold Monorepo — one lookup source, per-tool repos out

**Status:** Concrete structure proposal (2026-07-14). Grounded in the verified stack from `SCAFFOLDING-TAXONOMY.md` §5a (frontend = umbreon/React+Vite) and §5b (backend = TS/Express BFF, Guardian/Ory, Drizzle, Kafka, node-cron). This is the concrete form of §8.
**Owner:** Anish Adamane (Storefront workstream)

---

## 0. What this repo is (and is not)

**It is** the single, versioned **source of truth** for how a Headout internal tool is built: the shared framework packages, the always-present app skeleton, the 11 preset shapes (§7), and the composable feature modules — plus a **generator** that reads a scope-answers file and emits a repository.

**It is not** where tools run. Nothing deploys *from* this repo. When Storefront decides "build tool X," it **looks up this one monorepo**, the generator **composes base + preset + selected modules**, and it **packages a standalone git repository** that becomes the requester's own. That repo is what gets handed over, built on with Claude Code, reviewed, deployed, and auto-listed back into the catalogue.

> **Why this supersedes §8's "live feature-module monorepo":** a single deployed monorepo holding every team's tool couples unrelated tools into one build/deploy/blast-radius and makes ownership fuzzy. Making the monorepo a *template/catalogue source* and handing out *standalone repos* keeps each tool independently owned, deployed, and revocable — while still giving every tool the same paved road, because the framework arrives as **versioned dependencies**, not copy-paste. (`SCAFFOLDING-TAXONOMY.md` §8 should be updated to reference this doc.)

```
Storefront scope agent  ──►  answers.json  (the 10-question checklist, §6)
        │
        ▼
headout/internal-tools-scaffold   ← THE monorepo (this doc). Looked up, never deployed.
        │  registry maps answers → preset + module flags
        │  compose merges: bases/app-base + presets/<x> + modules/<selected>
        ▼
package-repo:  git init → create headout/<tool> → push → wire Guardian roles → register in catalogue
        │
        ▼
headout/<tool>   ← standalone repo handed to the requester.
                   Framework = @headout/* deps (upgradable). App = generated source (theirs to edit).
```

---

## 1. The tree

```
headout/internal-tools-scaffold
│
├── packages/                      ← SHARED FRAMEWORK. Published as @headout/*; emitted repos DEPEND on these (not copies).
│   ├── umbreon/                   ← the design system (pinned/re-exported from ExperienceOS; §5a)
│   ├── eslint-config/             ← DS rules (no-raw-form/table-elements, prefer-layout-primitives,
│   │                                 no-tailwind-color-palette, …) + local/require-auth-on-routes (§5b)
│   ├── tsconfig/                  ← shared strict TS bases (app / node / react)
│   ├── guardian-auth/             ← THE verified Guardian/Ory recipe (from Guardian-App-Starter-Kit, §5b)
│   │   ├── backend/               ← requireAuth, downstreams/guardian/{client,endpoints}.ts, guardian-config.ts
│   │   └── frontend/              ← bootstrap.ts, me-atom (useMe/useMaybeMe/useLogout), ory-client, devAuthCookiePlugin
│   ├── bff-kit/                   ← Express app factory + middleware stack (cors, request-id, request-logger,
│   │                                 error-handler → { error, code }) + typed downstream-client factory
│   ├── data-kit/                  ← Drizzle/pg pool + migration harness (drizzle-kit) ; mongo adapter (gated)
│   ├── async-kit/                 ← kafka producer/consumer helpers, node-cron registry, background-task tier
│   ├── observability/            ← Coralogix JSON logger, /health, /metrics (prom-client), dd-trace init
│   ├── llm-kit/                   ← Anthropic client, streaming (SSE), timeouts/retries, per-request cost logging
│   └── testing/                   ← vitest config, supertest helpers, Guardian auth test doubles
│
├── bases/
│   └── app-base/                  ← a MENU of slices, not one fixed bundle — every preset picks which it needs (§1a)
│       ├── core/                  ← package.json · tsconfig · .github/workflows/ci.yml · AGENTS.md ·
│       │                             .agents/skills/ · .env.example · README.md — ALWAYS, every preset, no exceptions
│       ├── frontend-shell/        ← Vite + React + TS: AppShell, react-router v7, DesignSystemProvider,
│       │                             TanStack Query, auth bootstrap — ONLY presets with a web UI
│       ├── backend-shell/         ← Express BFF entry: app factory from @headout/bff-kit, /health,
│       │                             requireAuth mounted — ONLY presets with a live HTTP backend
│       └── alt-shells/            ← extension-shell · mcp-shell · bot-shell · cron-entry — the non-web,
│                                     non-REST interfaces (§1a)
│
├── presets/                       ← the 11 shapes (§7). Each = a manifest + an overlay of files.
│   ├── viewer/                    │   preset.json  → { extends: app-base, modules: [], answers-defaults }
│   │   ├── preset.json            │   overlay/     → files merged onto the base for THIS shape
│   │   └── overlay/backend/app/downstreams/<svc>/   (proxy-only; no DB)
│   ├── warehouse-dashboard/       ← viewer + modules[data-bigquery-ro, cache-redis]
│   ├── crud-admin/                ← + modules[data-postgres]  (models + migrations + Form primitive)
│   ├── workflow-console/          ← crud + modules[async-*, integration-slack] (WizardPage + state machine)
│   ├── doc-store/                 ← crud/workflow but modules[data-mongo] replaces data-postgres
│   ├── automation-service/        ← backend-only + modules[async-kafka-worker, data-postgres, ratelimit]
│   ├── slack-bot/                 ← modules[integration-slack-bolt, data-postgres|sheets, async-background]
│   ├── mcp-server/                ← modules[mcp, auth-service-key, <data adapter>]  (no UI)
│   ├── ai-tool/                   ← crud + modules[llm, media-s3, (data-pgvector gated)]
│   ├── reporter/                  ← cron-only + modules[data-bigquery-ro, integration-slack]  (no web service)
│   └── extension/                 ← extension/ (Manifest v3) + backend OPTIONAL
│
├── modules/                       ← composable flags toggled by checklist answers (each = an overlay)
│   ├── data-postgres/             ← Drizzle models + migrations skeleton + repo/service layering (SMC pattern)
│   ├── data-mongo/                ← mongo driver + collection helpers (gated to Q4 = per-record-variable)
│   ├── data-bigquery-ro/          ← BigQuery read-only client + bytes-billed cap
│   ├── cache-redis/               ← TTL cache (mandatory with warehouse reads)
│   ├── async-background/          ← tier 1: in-process background tasks
│   ├── async-kafka-worker/        ← tier 2: separate worker service + DLQ + retries (SMC/kafkajs pattern)
│   ├── async-cron/                ← node-cron registry (SMC pattern) / railway cron for reporter
│   ├── auth-rbac/                 ← authorize(service,resource,permission) role-gating (SMC)
│   ├── auth-service-key/          ← API-key + webhook-signature auth for machine callers (SMC)
│   ├── integration-slack-bolt/    ← slack-bolt event handlers / slash commands
│   ├── integration-slack-notify/  ← outbound webhook notify
│   ├── media-s3/                  ← presigned uploads (files never transit the backend)
│   └── data-pgvector/             ← embeddings — only after the compass RAG check (§7 preset 9)
│
├── scaffold/                      ← THE LOOKUP + PACKAGING ENGINE
│   ├── answers.schema.json        ← the 10-question contract (§6) — Storefront fills this
│   ├── registry.ts                ← answers → { preset, modules[], flags } (the §6→§7 decision table, in code)
│   ├── compose.ts                 ← merge base + preset.overlay + modules[].overlay ; render placeholders
│   ├── package-repo.ts            ← git init → gh repo create headout/<tool> → push → Guardian roles → catalogue
│   ├── generate.ts                ← CLI/entry: answers.json → composed repo on disk → package-repo
│   └── presets.index.json         ← the catalogue index Storefront reads to describe options
│
├── catalogue/
│   └── manifest.json              ← registry of emitted tools (feeds Storefront auto-listing)
│
├── docs/  (DECISION-FRAMEWORK · QUESTIONS · GRADUATION · COMPONENT-REQUESTS)
├── pnpm-workspace.yaml · turbo.json · package.json · tsconfig.json
└── README.md
```

---

## 1a. `bases/app-base` is a menu, not a monolith

A common misreading of "every emitted repo starts from `bases/app-base`" is that every tool gets the *same fixed bundle* — a full Vite frontend and a full REST backend, whether or not the tool has either. It doesn't. Only **`core`** is unconditional. Everything else is a **slice** a preset either includes or drops — and a dropped slice isn't "base with something removed," it was never rendered into that repo in the first place.

**What's actually in `core`** — nine items, every repo, regardless of interface:

| File / folder | What it is |
|---|---|
| `package.json` | The workspace manifest — declares which `@headout/*` framework packages (§2) this repo depends on. Guardian auth + the relevant kit (bff-kit / mcp-kit / …) are always there; `umbreon` is added only when a `frontend-shell` is also present. |
| `tsconfig.json` | Extends `@headout/tsconfig`'s strict base (the app/node/react variant matches whichever shells exist). |
| `.github/workflows/ci.yml` | lint → typecheck → test → build, using `@headout/eslint-config`. The design-system rules only fire on repos that have a `frontend-shell` to lint. |
| `.agents/skills/` | `guardian-auth`, `api-integration`, `use-design-system` — copied in so the builder's Claude Code *follows* the verified recipe instead of reinventing auth or downstream wiring (the §5b model). |
| `AGENTS.md` | Embeds Building-a-scaled-app (PRD → prototype → system design → chunked implementation), plus this preset's specific conventions and its graduation triggers (§10). |
| `.env.example` | Every env var this composed repo actually needs — Guardian config always, plus whatever each turned-on module adds (`DATABASE_URL`, `KAFKA_BROKERS`, …). |
| `README.md` | What the tool is and how to run it locally — plus, for `mcp-server`, the `claude mcp add` / `.mcp.json` connection snippet. |
| `docker-compose.yml` | Local dev services. Present in every repo, but its body stays close to empty unless a data/cache module (`data-postgres`, `cache-redis`, …) adds a service to it. |
| `Dockerfile` + deploy manifest (`railway.toml` or equivalent) | The deploy target — an explicit open item, not a settled default (`SCAFFOLDING-TAXONOMY.md` §11: incumbent AWS/ODE pipeline vs Railway). |

`core` never contains business logic, models, routes, or UI components — none of that is interface-agnostic, so none of it belongs here. That's exactly what the shells, the preset overlay, and the modules add on top (§2a).

| Preset | `core` | `frontend-shell` (web UI) | `backend-shell` (HTTP) | alt shell |
|---|---|---|---|---|
| viewer | always | ✓ | ✓ *(proxy only)* | — |
| warehouse-dashboard | always | ✓ | ✓ | — |
| crud-admin | always | ✓ | ✓ | — |
| workflow-console | always | ✓ | ✓ | — |
| doc-store | always | ✓ | ✓ | — |
| automation-service | always | **✗ none** | ✓ *(trigger/status only)* | — |
| slack-bot | always | **✗ none** | **✗ none** | `bot-shell` |
| mcp-server | always | **✗ none** | **✗** *(no cookie auth)* | `mcp-shell` |
| ai-tool | always | ✓ | ✓ | — |
| reporter | always | **✗ none** | **✗** *(no listener)* | `cron-entry` |
| extension | always | **✗ replaced** | optional | `extension-shell` |

A reporter's emitted repo has **no `frontend/` directory and no HTTP server that ever calls `.listen()`** — there's no page to visit and nothing to keep warm, by design (§7 preset 10). An mcp-server's repo has no cookie-based `requireAuth` at all — MCP callers authenticate with a bearer service key, not an Ory session, so the web `backend-shell` doesn't apply and `alt-shells/mcp-shell` stands in for it. This is why §2a below states, for every preset, exactly which shells survive and what real folders get added — never just "base," unqualified.

---

## 2. Three layers — and how each travels to the emitted repo

The whole design turns on **what is a dependency vs what is generated source**:

| Layer | Lives in | Travels to emitted repo as | Who edits it |
|---|---|---|---|
| **Framework** | `packages/` | **Published `@headout/*` dependency** (semver, upgradable) | Platform team, once, for everyone |
| **Skeleton** | `bases/app-base/` | **Rendered source files** (copied + placeholders filled) | The requester (their app) |
| **Shape + flags** | `presets/`, `modules/` | **Rendered overlay files** merged onto the skeleton | The requester (their app) |

**Why the split:** shared logic that must never drift or fork — the Guardian auth recipe, the BFF middleware, the DS, the ESLint rules, the observability wiring — is a **versioned dependency**, so a fix or a Guardian change ships to every tool via a bump. Files the builder *must* edit — their models, routes, forms, jobs — are **generated into the repo** as owned source. This is the difference between a paved road and a pile of copy-paste that rots. (`Guardian-App-Starter-Kit` proves the recipe survives being packaged; SMC proves the same packages back a full CRUD backend — §5b.)

**One-language rule holds:** frontend Vite+React and backend Express BFF are both TypeScript, so an emitted repo is a single pnpm workspace, one `tsc`, one lint, and Claude Code stays on one stack front-to-back.

---

## 2a. Preset catalogue — problem statement → category → what we hand over

This is the lookup table the generator encodes: a requester's problem statement lands in exactly one **category**, which selects one **preset**, which determines **what repository we package and hand over**. Every row states two things concretely, not as a repeated name: which **shells** from §1a survive, and which **real folders** get added by the preset + the modules the checklist flags turn on. Read it as: *if the problem is this → we give that, specifically.*

| # | Problem statement (the requester's own words, generalized) | Category (interface · data · async) | Preset | Shells kept (§1a) | Concretely, in the repo |
|---|---|---|---|---|---|
| 1 | "I want to see information that already lives in our systems, gathered in one place." | web · read-only · none | **viewer** | frontend-shell + backend-shell (proxy only) | `core` + `backend/downstreams/<svc>/` (typed proxy client) — that's it. **No `models/`, no `migrations/`.** |
| 2 | "I want a dashboard over our historical / metrics / funnel data." | web · warehouse-read · cron (opt.) | **warehouse-dashboard** | frontend-shell + backend-shell | `core` + `backend/downstreams/<bigquery>/` + `backend/warehouse/` (bytes-billed cap) + `backend/cache/` (mandatory Redis TTL), (+ `backend/jobs/materialize.ts` only if queries are slow/costly). |
| 3 | "I want my team to create, track and edit records that don't exist anywhere yet — and every record has the same fields." | web · own DB (Postgres) · tier 0–1 | **crud-admin** | frontend-shell + backend-shell | `core` + `backend/models/` (Drizzle schema) + `backend/db/migrations/` + `frontend/forms/` (umbreon `Form` pages), (+ `authorize()` role-gating only if Q9 asked for it — otherwise absent, not stubbed). |
| 4 | "I want to move items through defined stages (draft → review → approved) with reminders." | web · own DB · tier 1–2 | **workflow-console** | frontend-shell + backend-shell | Everything crud-admin adds, **plus** `backend/workflow/` (state machine + validated transitions), `frontend/wizard/` (`WizardPage`/`WizardStepRail`), `backend/tasks/notify.ts` (Slack webhook on transition). |
| 5 | "I want to store and manage records where every record has a different shape." | web · document DB · tier 0–1 | **doc-store** | frontend-shell + backend-shell | The crud/workflow folders above, with `backend/models/`+`migrations/` **replaced** by `backend/collections/` (Mongo — schema enforced in code, no migration step). **Gated:** only when the shape is genuinely non-uniform. |
| 6 | "I want a process that runs automatically against other services — nobody really needs a screen." | headless API · own DB + queue · tier 2 | **automation-service** | **no frontend-shell** · backend-shell (trigger/status only) | `core` + `backend/routes/trigger-status.ts` + `backend/tasks/worker.ts` (a separate Kafka-consumer process) + `backend/ratelimit/`. **No `frontend/` folder ships at all** (optional status page if asked for). |
| 7 | "I want to do this work from inside a chat channel." | chat · own DB / sheet · tier 1 | **slack-bot** | no frontend-shell, no backend-shell → **`bot-shell`** | `core` + `backend/slack/` (bolt event/slash-command handlers) + a data adapter (`backend/models/` or `backend/sheets-adapter/`). |
| 8 | "I want our data / actions to be callable by AI agents — no human screen." | agent (MCP) · any adapter · none | **mcp-server** | no frontend-shell, no cookie-auth backend-shell → **`mcp-shell`** | `core` + `backend/mcp/` (tool/resource definitions) + `auth-service-key` (bearer, not the Ory cookie flow) + whichever data-adapter folder the source needs. `README.md` ships with the connection snippet. |
| 9 | "I want users to give input and get an AI-generated result, with saved state / uploads." | web · own DB + object store · tier 2 | **ai-tool** | frontend-shell + backend-shell | crud-admin's exact folders, **plus** `backend/llm/` (streaming + cost logging) + `backend/media/` (S3 presigned uploads), (+ `backend/embeddings/` only after the RAG check passes). |
| 10 | "I want a recurring summary pushed to a channel — nobody visits a page." | none (cron) · warehouse-read · cron | **reporter** | **no frontend-shell, no backend-shell (no listener)** → **`cron-entry`** | `core` + `backend/jobs/report.ts` (query → render) + `backend/warehouse/` + `backend/tasks/deliver.ts` (Slack/email/sheets). **No server process ever listens.** |
| 11 | "I want a control or overlay inside a page we already work in." | browser extension · none / backend opt. · none | **extension** | frontend-shell **replaced** → **`extension-shell`**; backend-shell optional | `core` + `extension/` (Manifest v3 build). `backend/` only appears if the checklist says it needs server state. |

**Before any of the above — the request must survive Gate 0.** Some problem statements get **no repository at all**, because a repo is the wrong answer. Those categories route out (details in `SCAFFOLDING-TAXONOMY.md` §4):

| Problem statement (generalized) | Category | We hand over |
|---|---|---|
| "Generate content and send it on a schedule/trigger, no real screen." | workflow automation | a no-code workflow (Zeps) — **no repo** |
| "Text/image in, artifact out, no saved state, one user." | one-shot transform | a Claude skill — **no repo** |
| "A single function one person runs occasionally." | utility | a script — maybe no repo |
| "Standard slicing of warehouse data, no custom logic." | BI/reporting | existing BI tooling — **no repo** |
| "Mostly the same as a tool that already exists." | duplicate | pointer to the existing tool — **no repo** |
| "Durable multi-service orchestration with day-long human waits." | engineering project | a project pitch — **not self-serve** |

So the full decision is two-step: **Gate 0** decides *whether* we hand over a repo at all; the preset catalogue above decides *which* repo. Only the 11 presets produce a packaged repository.

---

## 2b. Why each preset exists — real examples, and how the look-alikes differ

> **Examples name the *shape*, not the *size*.** Each preset below lists real Headout tools that share its problem *shape*. A few are heavyweight engineering products — **Delphi** (codebase-intelligence MCP), **Plato** (autonomous coding bot). **Nobody self-serves a Delphi — and that's exactly the point.** Delphi solves one particular problem at full engineering depth, but the *shape* of that problem — "let an agent answer questions about our data" — is one a non-technical team can meet with a **simple chatbot**. The example marks the shape; what the scaffold hands you is the lightweight version of it.

The catalogue has 11 entries because there are 11 genuinely different problem shapes — not 11 flavors of "an app." What separates each from its nearest neighbor is a single concrete question:

| # | Preset | Real examples (the shape) | What makes it its own preset — the separating question |
|---|---|---|---|
| 1 | **viewer** | VFS Dashboard, Booking Analytics Hub | Only *displays* data that already lives in a live internal **service**. **vs crud-admin:** it never writes, so it has no database. **vs warehouse-dashboard:** its source is a service (proxy), not the warehouse. |
| 2 | **warehouse-dashboard** | Ops Command Centre, Biz Data Analyst, Data Correlation Engine | Reads the **warehouse (BigQuery)**, which forces read-only creds + a bytes-billed cap + a cache. **vs viewer:** *where does the data live* — warehouse, not a service. |
| 3 | **crud-admin** | BOB-BizOps Tool, Assortment Mapper, Candidate NPS | *Creates and edits* brand-new records of a **uniform shape** → it owns a Postgres DB. **vs viewer:** it writes. **vs workflow-console:** the records are flat — they don't move through stages. |
| 4 | **workflow-console** | Blueprint (onboarding), HiringOS, invoice generation | Records **move through defined stages** (draft → review → approved) with transitions + reminders — a state machine. **vs crud-admin:** *do the records go through steps and approvals?* If yes, it's this. |
| 5 | **doc-store** | vendor-payload ingestion (precedent: `payload`, `athena`) | Every record is a **different shape** → schemaless (Mongo). **vs crud-admin:** *is every record the same fields?* If no — and only if genuinely no — it's this. Gated hard. |
| 6 | **automation-service** | `las` (Listing Automation Service), TTD-Automation-Suite, Pompeii Voucher Generator (prod: `dior`) | **Event/trigger-driven orchestration** against third parties; queue-first, no screen. **vs reporter:** *does it react to incoming work* (queues, rate limits) rather than run on a clock? |
| 7 | **slack-bot** | `bar` (Slack→Jira), Wanda (on-call triage), `genie`, `optimus` · *eng-grade ceiling: Plato* | **Humans** do the work inside a chat channel. **vs mcp-server:** the users are *people in Slack*. Plato is the graduation ceiling of this shape — a self-serve build here is a simple channel bot, not Plato. |
| 8 | **mcp-server** | `aviator`, `argus-mcp`, `porygon-mcp`, `talentmcp` · *eng-grade ceiling: Delphi* | **AI agents** are the caller — data/actions exposed as tools, no human UI. **vs slack-bot:** the *agent* is the user. Delphi is the ceiling; a self-serve MCP is a thin data adapter, not Delphi. |
| 9 | **ai-tool** | Spectra Image Gen, Combo Split Image Gen, ResumeRanker | LLM-powered **and** needs multi-user state / uploads / queues. **vs a Claude skill (Gate 0):** *is there persistent state or file upload?* If no, it's a skill and gets no repo. |
| 10 | **reporter** | metricbot shape ("dashboards" nobody visits) | **Scheduled** query → render → deliver a digest; the output *is* the product, no page. **vs warehouse-dashboard:** nobody visits it — it's pushed on a cron. **vs automation-service:** it's a clock-driven summary, not event-driven orchestration. |
| 11 | **extension** | metaview, nexus, alan, open-mb-in-localhost | The right UI lives **inside a page you already use** (button/overlay). **vs viewer:** it isn't a standalone app — it augments an existing page. |

The rule of thumb the catalogue encodes: **the preset is chosen by the shape of the problem (who's the user, where's the data, does it write, does it move through stages, is there a clock or a trigger), never by how big the eventual thing might get.** Size is the graduation question, and it comes later.

---

## 3. The generator — lookup → compose → package

**Input** — Storefront's scope agent emits `answers.json` against `answers.schema.json`:

```jsonc
{
  "name": "candidate-nps",
  "owner_group": "talent-ops",
  "guardian_roles": ["talent-ops:view", "talent-ops:edit"],
  "checklist": {
    "q1_users": "10-30 internal",          // → self-serve tier
    "q2_reads_or_writes": "writes",         // → a DB exists
    "q3_data_home": "nowhere-yet",          // → own DB, not proxy/warehouse
    "q4_record_shape": "uniform",           // → Postgres (not Mongo)
    "q6_freshness": "polling",
    "q7_slow_or_scheduled": "notify-on-save",// → async tier 1
    "q8_third_parties": ["slack"],
    "q9_authz": "role-gated",               // → auth-rbac
    "q10_durability": "durable"
  },
  "interface": ["web"]
}
```

**Lookup** — `registry.ts` maps answers → composition (the §6→§7 table, executable):

```
q2=writes ∧ q3=nowhere-yet ∧ q4=uniform      → preset: crud-admin
q9=role-gated                                → + module: auth-rbac
q7=notify-on-save ∧ slack                    → + modules: async-background, integration-slack-notify
q10=durable                                  → CI/observability rigor ON
                                             ⇒ { preset:"crud-admin", modules:["auth-rbac","async-background","integration-slack-notify"] }
```

**Compose** — `compose.ts` layers files (later wins) and renders placeholders (`{{name}}`, `{{owner_group}}`, `{{guardian_roles}}`, downstream URLs):

```
bases/app-base/**                    (skeleton)
  ⊕ presets/crud-admin/overlay/**    (models/, migrations/, Form pages)
  ⊕ modules/auth-rbac/overlay/**     (authorize() wiring on edit routes)
  ⊕ modules/async-background/**      (notify task)
  ⊕ modules/integration-slack-notify/**
```

**Package** — `package-repo.ts` turns the composed tree into the handover artifact:
1. `git init`, write files, `pnpm install` (pulls `@headout/*` framework deps).
2. `gh repo create headout/candidate-nps --private`, push `main`.
3. Register Guardian roles for `owner_group` (from `guardian_roles`).
4. Write a `catalogue/manifest.json` entry → Storefront auto-lists the tool.
5. Return the repo URL + "open in Claude Code" handoff (AGENTS.md + `.agents/skills/` already inside).

---

## 4. Worked example — what lands in `headout/candidate-nps`

From the `answers.json` above, the emitted **standalone** repo:

```
headout/candidate-nps
├── package.json               deps: @headout/umbreon, @headout/guardian-auth, @headout/bff-kit,
│                                    @headout/data-kit, @headout/observability, @headout/eslint-config
├── frontend/
│   ├── src/app/AppShell.tsx           (from base; DS provider + auth bootstrap wired)
│   ├── src/routes/candidates/         (crud-admin overlay: ListPage + DetailPage)
│   └── src/forms/CandidateForm.tsx    (umbreon Form primitive + Zod; raw react-form ESLint-banned)
├── backend/
│   ├── src/index.ts                   (bff-kit app factory; requireAuth mounted on /api)
│   ├── src/models/candidate.ts        (Drizzle schema — crud-admin overlay)
│   ├── src/db/migrations/0001_init.sql
│   ├── src/routes/candidates.ts       (CRUD; authorize('candidate-nps','record','EDIT') from auth-rbac)
│   └── src/tasks/notify.ts            (async-background → integration-slack-notify on create)
├── .agents/skills/{guardian-auth,api-integration,use-design-system}/
├── .github/workflows/ci.yml
├── docker-compose.yml         (local Postgres)
├── AGENTS.md · .env.example · README.md
```

The requester opens this in Claude Code; Claude follows `.agents/skills/api-integration` to add any downstream and `use-design-system` to build UI against umbreon. No auth, DS, CI, logging, or migration harness was hand-built — it arrived from `@headout/*`.

---

## 5. Decisions baked in (call out for platform sign-off)

- **Framework = published deps, app = generated source** (§2). Requires the registry access already listed in `SCAFFOLDING-TAXONOMY.md` §11 (umbreon + guardian-auth + bff-kit consumable outside their origin repos).
- **Output = standalone repo**, not a PR into a live monorepo (supersedes §8). If the platform team prefers a live monorepo, `package-repo.ts` gets a second emit target (`add-feature-module`) — the compose step is identical; only the emit differs.
- **pnpm workspace + turbo** for this monorepo (matches `Guardian-App-Starter-Kit`, the auth reference). Emitted repos are single pnpm workspaces.
- **Stack = TS/Express + umbreon** everywhere (§5a/§5b). Python/FastAPI or Kotlin/Spring are *not* emitted by this generator — they're the graduation path (§10), a separate template-per-repo flow.
- **Queue = Kafka** (`async-kafka-worker`), matching the incumbent (§5b) — not Celery/SQS.

**Open items inherited from `SCAFFOLDING-TAXONOMY.md` §11:** deploy pipeline (AWS/ODE vs Railway) and versioned-migration policy (`drizzle-kit` migrate vs `push`) — both surface in `bases/app-base` and must be settled before the first real emit.

---

## 6. Build order (minimal path to a first real handover)

1. Stand up the monorepo skeleton (`packages/`, `bases/app-base`, `scaffold/`) with **`crud-admin`, `viewer`, `reporter`** presets only — the three that cover most of the audited demand.
2. Publish `@headout/guardian-auth` + `@headout/bff-kit` + pin `@headout/umbreon` (the §5b/§5a verified code, re-platformed off Replit plumbing).
3. Implement `registry.ts` + `compose.ts` + `package-repo.ts` end-to-end for `crud-admin`.
4. Emit one real tool from the audit (e.g. Candidate NPS or Assortment Mapper), review, deploy, confirm auto-listing.
5. Add the remaining presets/modules incrementally; each is additive (a manifest + an overlay), no engine change.

# Storefront Scaffolding — Taxonomy & Scaffold Catalogue

**Status:** Proposal — grounded against the real `headout/experienceos` repo: **frontend** (§5a, read 2026-07-13) and **backend** (§5b, read 2026-07-14, incl. `supply-mission-control`, `Guardian-App-Starter-Kit`, and both service templates). Backend is now **grounded, not open**: the incumbent **TS/Express** stack already runs a full production backend (Postgres+Drizzle, Kafka, cron, Guardian+RBAC) — recommended as the self-serve default; the only remaining call is org ownership + deploy pipeline with the platform team (§11).
**Owner:** Anish Adamane (Storefront workstream)
**Date:** 2026-07-13

---

## 1. What this document is

Storefront is the front door for internal tools at Headout. When someone asks it for a tool, it first checks whether the tool already exists, then whether it should be built at all — and if the answer is "build it as an app," Storefront scaffolds a **feature module inside a shared internal-tools monorepo** (not a greenfield per-tool repo). The requester builds on it with Claude Code. Most requesters are non-technical.

This document defines that scaffolding system end to end:

1. **Gate 0** — which requests never become apps, and where they route instead (§4)
2. **The fixed standards** baked into every scaffold, and why (§5)
3. **The 10-question checklist** that turns a request into a specific scaffold (§6)
4. **The catalogue** — 11 scaffold presets: *if a user wants to build X, they get feature module Y, because Z* (§7)
5. **The monorepo + generator** that produce these modules (§8)
6. **Component gaps** — what to do when the design system doesn't have the piece yet (§9)
7. **The graduation policy** for tools that outgrow self-serve (§10)

**What we are asking the platform team to approve** (details in §11):

- The fixed standards in §5 (Guardian always; **React + Vite** frontend; **ExperienceOS design system** + ESLint rules; **TS/Express backend** — the grounded incumbent, §5b; deploy pipeline + org ownership to confirm with the platform team)
- The **single monorepo / feature-module** architecture (§8) over one-repo-per-tool
- The 11 preset compositions in §7
- Items that need platform involvement: Guardian session-validation for the chosen backend, ExperienceOS package access + ESLint rules in `packages/`, Railway + BigQuery RO provisioning, and the component-request track (§9)

---

## 2. Why scaffolds — the evidence in brief

We audited the "Headout Workspace" Replit Teams org (July 2026) and cross-checked it against all 535 repos in the `headout` GitHub org. Findings:

- **39 internal tools** have been self-built by non-engineering teams (Ops, Finance, Marketing, HR, Supply) on Replit alone.
- **Duplicate effort is real, not hypothetical.** Three separate reconciliation tools were built by/for Finance while `headout/recon` — an engineering service whose README states the same purpose, with an existing Retool upload UI — was already live.
- **~30 of the 39 tools have no GitHub presence at all.** If the Replit project or account lapses, the code is gone.
- **A large share are already abandoned.** The workspace is littered with dead projects — including two successive rebuilds of the same tool, both since ditched. There is no lifecycle: nothing marks a tool as dead, so abandoned projects (and whatever data or credentials they hold) linger indefinitely and pollute any attempt at discovery.
- **None of the self-built tools use Guardian.** Business data (invoices, vendor details, CRM sends) sits behind ad-hoc or no auth, on storage outside the standard stack.

Teams will keep building — the demand is proven. Scaffolds make the paved road (Guardian, backed-up code, org standards, review gate) *cheaper* for the builder than the side road, which is the only gating strategy that works without hard blocks.

---

## 3. How a request becomes a feature module

```
User describes what they need (conversation with Storefront)
        │
        ▼
GATE 0 — is this even an app?  ──────────────►  routed to Zeps / a Claude skill /
        │  (survives)                            an MCP / a script / an existing
        ▼                                        tool / Retool / an eng project
10-QUESTION CHECKLIST  (scope agent asks; answers become flags)
        │
        ▼
PRESET + FLAGS selected  (one of the 11 in §7)
        │
        ▼
GENERATOR scaffolds a feature module into the shared monorepo (§8)
  → apps/<name>/ (or features/<name>/) with its own route
  → route gated by Guardian roles for the requesting user/group
  → shared packages/ (design system, ESLint, utils) already wired
  → HeadoutAgentsConfig + ExperienceOS skills/rules installed once at monorepo root
        │
        ▼
User builds on it with Claude Code  →  review gate  →  single monorepo Railway deploy
        │
        ▼
Tool auto-listed back into the Storefront catalogue
```

**Why not one repo per tool:** one build/deploy pipeline, OD support out of the box, shared design-system + ESLint enforcement, and Guardian role wiring per route instead of per-repo auth reinvention. ExperienceOS and Bob are candidates to consolidate into this monorepo (discussed with the platform team); Orbit and other internal tools can follow the same pattern.

---

## 4. Gate 0 — what never gets scaffolded

Most requests should **not** become apps. The scope agent routes these before any scaffold is chosen:

| The request is really… | Route to | Why |
|---|---|---|
| Generate content → send via a channel (email/Slack/WhatsApp), on a schedule or trigger, no real UI | **Zeps** | Zeps is the no-code platform for exactly this; scaffolding it would formalize duplicating Zeps |
| Text/image in → artifact out, no persistent state, single user | **Claude skill** | No app needed at all |
| A single function run occasionally by one person | **Script** | May not even need a repo |
| Data/actions another *agent* needs to call, no human UI | **MCP registration** | Unless it needs its own service — then preset 8 |
| A BI/reporting view over warehouse data with standard slicing | **Retool / Looker / Hex** | The BI tooling decision is owned by the data team; we don't fork it |
| Mostly covered by an existing tool | **Extend the existing tool** | Storefront's discovery step checks the catalogue + Delphi first — this is the check the three reconciliation tools never had |
| Durable multi-service orchestration, human-in-the-loop waits over days, replay guarantees | **Engineering project** (pitch, not repo) | Temporal/K8s-grade work is beyond self-serve; see §10 |

Only what survives this gate reaches the checklist.

---

## 5. Fixed standards — in every scaffold, non-negotiable

These are the same regardless of which preset is chosen. Each exists for a reason we can defend:

| Standard | What, concretely | Why |
|---|---|---|
| **Auth = Guardian** | Web UIs: `@headout/headauth` (session bootstrap, login redirect, session-lockout, 401 interceptor). APIs: a backend dependency that validates the Ory session against Guardian `whoami`. **Routes in the monorepo are protected via Guardian roles tied to the requesting user/group** — not a separate auth story per tool. The FastAPI (or chosen-backend) Guardian dependency is **net-new** if we stay on FastAPI — existing Python integrations are Django-only. | Every self-built tool we audited skipped auth because it was effort. Pre-wiring it makes the secure path the zero-effort path. One auth system also means one access-review surface. |
| **Frontend = React + Vite (not Next.js)** | SPA: React 18 + TypeScript + Vite. **Verified stack in ExperienceOS:** `react-router-dom` v7, **TanStack Query** (server state) + **TanStack Form** (forms), TanStack Virtual, Recharts, `next-themes`, Storybook. No App Router / SSR for self-serve internal tools. | Confirmed in the ExperienceOS repo, not just the sync: internal tools only need static assets behind a login. Next.js is SSR-heavy overhead they don't need. Vite is the simpler paved road. (Next.js remains a *graduation* option for eng-owned product surfaces — see §10 — not the self-serve default.) |
| **UI = `@headout/umbreon`** (the ExperienceOS design system) | Published package, Radix-based, thematic light/dark via `DesignSystemProvider`; ~60 components built for data-intensive UIs — layout shells (`TablePage`/`DetailPage`/`ListPage`/`WizardPage`/`AppShell`), primitives (`Stack`/`Flex`/`Grid`/`Container`), `Table`/`VirtualList`/`ColumnConfigurator`, `Form`/`Select`/`FileUpload`, filters, accordions. **Full verified inventory + per-component specs in §5a.** Agentic-friendly: real `create-component-ho` / `generate-ui` skills + a DS retrieval index produce ~90% usable UI from PRD+ERD. | One internal-tools look; design-system adoption comes free; Claude Code generates against a known, documented component vocabulary instead of inventing layouts. |
| **Code standards = ExperienceOS ESLint rules** | The **real, enforced** rule set (`scripts/eslint-design-system-rules.mjs`, verified §5a): `design/no-raw-form-elements`, `design/no-raw-table-elements`, `design/prefer-layout-primitives` (`<Flex direction="column">`→`Stack`; `Flex`/`Grid`/`Stack` over raw `div`), `design/no-tailwind-color-palette` (semantic tokens only), `design/prefer-text-and-tokens` / `design/prefer-text-props`, `design/no-tanstack-react-form-direct` (go through the `Form` primitive), and `local/no-new-legacy-ui-imports` (legacy-UI freeze). | Catches non-compliance before review. Semantic component names are self-documenting in PRs vs. reading class strings. |
| **Backend = TS/Express incumbent (grounded — §5b)** | **Resolved against the real backend code (§5b):** the incumbent `supply-mission-control` is a **full production CRUD backend on TypeScript/Express** — Postgres+Drizzle (~40 migrations), Kafka, `node-cron`, BigQuery, S3, and Guardian/Ory auth **with RBAC** — and `Guardian-App-Starter-Kit` codifies the auth+BFF recipe as agent skills. It covers every §7 preset in one language, front-to-back. **Recommended as the self-serve default.** FastAPI stays the alternative only if the platform team wants Python (Guardian net-new); Kotlin/Spring is the §10 graduation target. Two items still open for the platform team: deploy pipeline (incumbent AWS/ODE vs Railway) and versioned-migration policy. §7 presets are written FastAPI-style — read them as capability shapes; the stack is TS (queue = Kafka, not Celery/BullMQ). | One language front-to-back keeps Claude Code on one stack, and the TS/Express side is the *only* option with Guardian + DB + migrations + queue + cron already wired and in production. |
| **Data shape rule (confirmed direction)** | **Postgres** for repeatable structured/relational data; **MongoDB** for unstructured / non-repeatable / per-record-variable payloads. Checklist Q4 picks the preset (§6–§7). | Matches ExperienceOS sync guidance; same gate as preset 3 vs 5. |
| **Deploy = Railway (one pipeline)** | One monorepo build + deploy; OD support comes with the shared pipeline. `docker-compose.yml` for local multi-service dev. | Already the Storefront platform decision; one deploy story instead of N Railway projects per micro-tool. |
| **Observability** | Coralogix JSON logging + `/health` + optional `/metrics` (Prometheus), error format standardized. | Minimum that makes platform support possible for self-serve tools. |
| **Agent config** | Monorepo root installs `HeadoutAgentsConfig` (common + frontend bundles) once; feature modules inherit. `AGENTS.md` embeds **Building-a-scaled-app** (PRD → prototype → system design → chunked implementation) plus preset conventions and graduation triggers. | Builders start with org standards; configs stay in sync as standards evolve. |

---

## 5a. ExperienceOS — the verified reference implementation

Grounded against the real `headout/experienceos` repo (read 2026-07-13), not the sync notes. This is what "reference ExperienceOS" concretely means — and where the doc's earlier assumptions were wrong, this section is the correction of record.

**Repo shape (correction to §8).** `headout/experienceos` is a **git-submodule monorepo** wrapping two real apps as submodules — `mmp-builder` (the MMP Builder, package `mmp-suite`) and `supply-mission-control`. It is **not** an `apps/`+`packages/` workspace. Each app is internally `client/` (React SPA) + `server/` (Express BFF) + `packages/design-system/` (the DS, released as its own package). The single-monorepo/feature-module model in §8 is our **proposed** consolidation target, not what ExperienceOS is today.

**Design system = `@headout/umbreon`** (v0.1.0; released via `release-umbreon.yml`; peer deps react / react-dom / react-router-dom). Built on **Radix UI** + class-variance-authority. Exports ~60 components:
- **Layout shells:** `TablePage`, `DetailPage`, `ListPage`, **`WizardPage`**, `AppShell`
- **Layout primitives:** `Stack`, `Flex`, `Grid`, `Container`, `Layout`
- **Form inputs:** `TextField`, `TextArea`, `Select`/`AsyncSelect`/`VirtualSelect`, `Checkbox(Group)`, `Radio(Group)`, `Switch`, `DatePicker`/`DateRangePicker`/`TimePicker`, `TagField`, `FileUpload`, **`Form`**, `InlineEdit`
- **Data/tables:** `Table`, `TablePagination`, `TableColumnMenu`, `VirtualList`, `ColumnConfigurator`
- **Navigation:** `PageHeader`, `Breadcrumbs`, `Tabs`, `FilterTab`, `SideNavigation`, **`WizardStepRail`**
- **Overlays/feedback:** `Dialog`, `Tooltip`, `HoverCard`, `Popover`, `Menu`, `Alert`, `Toast`, `EmptyState`, `ErrorState`
- **Composition helpers:** `Accordion`, `SectionCard`, `BulkActionToolbar`, `ExpandableText`, `MediaCarousel`, `NestedSelect`, `Tile`

Theming via `DesignSystemProvider` (writes `data-theme`; light/dark/system). Per-component specs live in `specs/design-system/components/*.md` plus `ai-component-docs.md` and `accessibility.md`.

**Design tokens are a real pipeline:** `client/src/tokens/tokens.css` is the source of truth → `scripts/sync-design-tokens.mjs` generates `design-tokens.generated.{json,ts}` (`yarn tokens:generate` / `tokens:check`).

**ESLint DS rules exist and are enforced** (`scripts/eslint-design-system-rules.mjs`): `design/no-raw-form-elements`, `design/no-raw-table-elements`, `design/prefer-layout-primitives`, `design/no-tailwind-color-palette`, `design/prefer-text-and-tokens`, `design/prefer-text-props`, `design/no-tanstack-react-form-direct`, and `local/no-new-legacy-ui-imports`.

**Backend = an Express (TypeScript) BFF — not FastAPI.** `server/` is Express 4 with `middleware/auth/guardian.client.ts` + `auth.middleware.ts` (validates the Ory/Guardian session), `api-proxy.middleware.ts` (forwards the user's session to downstream services — the BFF pattern), plus cors / request-id / request-logger / error-handler. mmp-builder is **proxy-shaped** (no DB in its deps) — it is the `viewer`/proxy pattern (preset 1) running in production. Client auth: pre-mount `modules/auth/bootstrap.ts`, session-lockout store, invalid-session dialog, `route-access-permission`, and an admin panel that manages user **roles** — role-gated access is already implemented, not aspirational. Local Ory dev via `yarn ory:tunnel`. **This is the incumbent that reframes the backend decision (see §5 backend row, §11).**

**AI/agentic UI generation is real tooling.** mmp-builder ships Claude skills: `create-component-ho` (7 phased steps + component/stories/styles/types templates), `generate-ui` (question-framework → pattern-selector → code-generator → output-validator), `ds-generate-ui`, `ds-component`, `ds-storybook`, `ds-migrate`, `frontend-design-ho`, `create-ui-iterations-ho`, plus a `ds:retrieval-index` build so an agent can retrieve the right component. This is what backs the "~90% usable UI from PRD+ERD" claim.

**CI/ops (real):** GitHub Actions (build, PR, semver-release, a separate `release-umbreon` for the DS package), `ci/Dockerfile`, **Medusa ODE** init (`ci/scripts/ode-init.cjs`), and **Vulcan** review wired (`.vulcanho` / `VULCANHO.md`). Deploy here is Docker-based — **do not assume Railway for ExperienceOS** (Railway remains the Storefront-side proposal, §5).

---

## 5b. Backend — the verified reference implementation

Grounded against the **real backend code** (read 2026-07-14) of four repos, every claim `gh api`-verified, correcting assumptions the same way §5a did for the frontend: `headout/experienceos` submodules **`supply-mission-control`** (SMC) and **`mmp-builder`**, the **`Guardian-App-Starter-Kit`** Express-5 BFF, and the two official templates **`python-fastapi-template`** / **`spring-boot-service-template`**.

**Headline (resolves the §5 "backend OPEN" row):** the ExperienceOS incumbent is **not** a FastAPI service and **not** merely a thin proxy. **SMC is a full production CRUD backend on TypeScript/Express** — owned Postgres, Kafka pipelines, cron, BigQuery, S3, LLM/agent workflows, and Guardian/Ory auth *with RBAC*. It already demonstrates every backend capability the scaffold catalogue (§7) needs, in the **same language as the frontend**. So "adopt the incumbent TS/Express stack" is now a grounded option, not an aspiration — this is the backend twin of adopting umbreon in §5a. The remaining decision (§11) is an org-ownership call for the platform team, not a capability gap.

### The three TS/Express references, and what each proves

| Repo | Shape | What it proves |
|---|---|---|
| **`supply-mission-control`** (SMC) | **Full CRUD backend** | The incumbent TS/Express stack runs a real data backend at production scale — the reference to copy for presets 3/4/6/9/10. |
| **`mmp-builder`** | **Thin BFF** (host client + dev proxy + ready-to-mount auth) | The minimal proxy-shaped end — the reference for preset 1 (`viewer`). |
| **`Guardian-App-Starter-Kit`** | **BFF + Guardian auth, codified as agent skills** | The cleanest, best-documented Guardian/Ory + BFF pattern, written as `.agents/skills/` for a coding agent to *follow*. The auth recipe of record. |

### Auth = Guardian/Ory, verified working today (three independent implementations)

The pattern is identical across all three TS repos: **extract the Ory session cookie by configured prefix → POST it to Guardian's `whoami` → attach the resolved Headout identity to the request.** Guardian is the SSO indirection in front of Ory — the app never calls Ory `whoami` directly.

- **`Guardian-App-Starter-Kit`** — the reference recipe. `requireAuth` (`artifacts/api-server/src/middlewares/require-auth.ts`) reads `req.cookies[ORY_SESSION_COOKIE_NAME]`, builds `name=value`, calls `whoami(rawCookie)` → `POST {GUARDIAN_BASE_URL}/auth/whoami` (`downstreams/guardian/endpoints.ts`), attaches `req.auth = { user, rawCookie }`. Errors normalize to `{ error, code }` with a fixed status map (401→UNAUTHORIZED, downstream 5xx/network→502 BAD_GATEWAY, misconfig→500). A **custom ESLint rule `local/require-auth-on-routes`** machine-enforces that every route file mounts `router.use(requireAuth)` before any handler (`/api/healthz` is the only opt-out).
- **SMC** — the same core (`src/middleware/auth/{auth.middleware,auth.service,guardian.client}.ts`), mounted **globally** at `app.use('/api', authenticate)`, **plus real RBAC**: an `authorize(service, resource, permission)` middleware backed by Guardian `checkPermissions` / `getAllPermissions`, a Guardian identity cache (TTL), a group allowlist, and separate machine-caller paths — **API keys** (`smcApiKeys[]`, for Replit/service callers) and **webhook-signature auth** (Zendesk, VectorShift) + a CE magic-link HMAC flow. This is the reference for role-gated (Q9-deep) and headless (preset 6/7/8) auth.
- **`mmp-builder`** — the same guard exists (`server/middleware/auth/`) but is a **ready-to-mount reference not currently in the request path** (no API routes to guard; `authenticate` is deliberately not re-exported from the middleware barrel). *Correction to the earlier §5a wording that implied it runs live.*

**Dev-mode auth** has two real, verified mechanisms (not a hardcoded bypass): (1) `yarn ory:tunnel` (ExperienceOS) runs the Ory tunnel so real session cookies are valid on `localhost`; (2) the Guardian-App-Starter-Kit **Vite `devAuthCookiePlugin`** (`artifacts/web/vite.config.ts`) serves `/__dev-auth-cookie` that sets an `HttpOnly` cookie from server-side `ORY_SESSION_COOKIE_NAME` + `ORY_SESSION_TOKEN` (name is shared config, value is a per-dev secret, split on purpose; the token never enters the JS bundle). In prod, 401 → redirect to the Ory hosted login.

**This makes the §5 backend row resolvable:** the Guardian dependency the doc called "net-new if we stay on FastAPI" is **already built, tested, and running in TypeScript** in three places. It is net-new *only* if we choose Python.

### BFF / downstream-proxy pattern (real, and the correction to §5a)

The genuine production BFF pattern — browser calls only `/api/*`; the server forwards the user's Ory cookie to downstream Headout services — is **real in SMC and Guardian-App-Starter-Kit**, not in mmp-builder. *Correction of record:* §5a cited `mmp-builder`'s `api-proxy.middleware.ts` as "forwards the user's session downstream — the BFF pattern." In fact that middleware is a **dev-only, cookie-domain-rewriting convenience** (hard-403s outside `NODE_ENV=development`); mmp-builder's real downstream calls happen from the **client** (React Query). The forwarding-BFF pattern to copy lives in:
- **Guardian-App-Starter-Kit** — one folder per downstream (`src/downstreams/<svc>/{client,endpoints}.ts`): a singleton `axios.create` whose request interceptor injects `config.rawCookie` → `Cookie` header, response interceptor normalizes to a typed `<Svc>Error`; `endpoints.ts` = one typed async fn per call; optional `services/<svc>/` for Zod validation/business logic; `routes/<svc>.ts` under `requireAuth`. SMC (tour-group) is the worked example. Codified in the **`api-integration` skill** (two phases: per-downstream wiring, per-operation exposure).
- **SMC** — the same shape at scale: `src/shared/clients/*` + per-feature `gateway/*` to `aries`, `hub`, `scorpio`, `suppliers`, `slack`, `athena`, `google-ads`, `s3`, `scraper-service`, `vector-shift`. SMC both **owns state and proxies/aggregates downstream**.

### Data layer = Postgres + Drizzle (verified; the full CRUD proof)

- **SMC** is the proof the incumbent supports a real relational backend: **Postgres via Drizzle** (`drizzle-orm/node-postgres` over a `pg.Pool`), a multi-DB connection manager (`src/database/postgres/database.ts`; databases `smc`/`retool`/`self-hosted-retool`), **7 schema files** (`src/database/postgres/schema/*.schema.ts` — `pgTable`s with FKs, `pgEnum`, `jsonb`, typed `$type<>()` columns), **~40 ordered SQL migrations** (`database/init/01…38*.sql` + seed), and a repository/service/controller layering (`.repo.ts`/`.queries.ts`, a `Tx` type for transactions). It **also** reads BigQuery (`src/database/bigquery/client.ts`) for analytics.
- **Guardian-App-Starter-Kit** = the clean starting template: `@workspace/db` (`pg.Pool` + `drizzle`, `DATABASE_URL`), schema barrel at `lib/db/src/schema/index.ts` (currently a placeholder with the canonical `pgTable`+`drizzle-zod` sample in a comment), and **`drizzle-kit push`** for dev schema sync (versioned migrate is left to the deploy target). Plus an **Orval OpenAPI→typed-client** flow: one `openapi.yaml` → two generated packages (`api-client-react` React-Query hooks + `api-zod` runtime parsers the server validates against).

**Migration nuance to carry forward:** SMC uses hand-authored ordered SQL; the starter kit uses `drizzle-kit push`. For self-serve scaffolds, prefer **versioned `drizzle-kit` migrations** (schema errors surface at migrate time where Claude Code can see and fix them) over `push` — same rationale §7 preset 3 gives for Alembic.

### Async, cron, observability, deploy (SMC, verified)

- **Async/queue = Kafka (`kafkajs`)** — producers + a consumer manager (`src/features/mmp-builder/kafka/…`, `kafka/consumers/consumerManagerService.ts`), ~14 topics with per-topic consumer groups, DLQ topics + retry/rate-limit on the Zendesk consumers. This is the incumbent's durable-messaging path (the org's Kafka standard), *not* BullMQ — a divergence from the §7 preset text (which assumes Celery+SQS/BullMQ). **Reconcile in §7: the TS incumbent's queue is Kafka.**
- **Cron = `node-cron`** — 5 registered schedulers in `src/index.ts` (`iterationAutoClose` daily `0 0 * * *`, cleanups, sync, auto-return). This directly backs preset 4's reminders and preset 10 (`reporter`) — in-process, no separate cron service needed for the common case.
- **Observability** — `prom-client` `/metrics`, Swagger `/api-docs`, `helmet`, `express-rate-limit`, `dd-trace` (Datadog), Coralogix JSON logs, `/health`. Exceeds the §5 "observability" minimum out of the box.
- **Deploy = Docker → AWS ECR + Medusa ODE**, GitHub Actions (build/test matrix, semver-release), Datadog-traced. **Not Railway.** *This is the real tension with §5's Railway decision:* the incumbent ships on Headout's AWS/ODE pipeline. If Storefront's monorepo adopts the incumbent stack, either it also adopts the AWS/ODE pipeline or Railway is re-justified for the self-serve tier — an explicit §11 item, not a detail.

### The two templates, as alternatives (verified)

| | `python-fastapi-template` | `spring-boot-service-template` | incumbent TS/Express (SMC) |
|---|---|---|---|
| **Guardian/Ory** | **Absent** — only reads `X-Session-ID`/`X-Username` into OTel baggage, never validates. Net-new from scratch. | **Built-in + tested** (`GuardianAuthFilter` → `InternalAuthClient.getIdentity`, `guardian-client`/`guardian-model` deps). | **Built-in, running, + RBAC.** |
| **DB + migrations** | Async Postgres + SQLModel + **Alembic (real)**. | **MariaDB** + JPA/Hikari, **no migration tool** (net-new Flyway/Liquibase). | Postgres + Drizzle + ~40 SQL migrations. |
| **Async/queue** | Native `BackgroundTasks` only; no Celery/Redis. | Kafka libs present but **unwired** (no config/test). | **Kafka wired** (producers/consumers/DLQ). |
| **Cron** | none | `@Scheduled` available, unconfigured | **`node-cron` wired** (5 jobs). |
| **Instantiation** | Manual README checklist, `YOUR_SERVICE_NAME` placeholder, **no `init.sh`**. | **Automated `init.sh` + `repo-init.yaml`** self-rename. | (monorepo feature-module, not template-per-repo) |
| **CI** | lint/type/test active; **Docker→ECR + semver disabled by default**. | coverage-gated (Kover 50%) + detekt + repo-init, all active. | full build/test/semver, ODE, Vulcan. |

*Corrections to earlier notes:* the FastAPI template's Docker→ECR + semver-release workflows are **disabled by default** (commented `workflow_dispatch`, `YOUR_SERVICE_NAME` placeholder) — not live as previously implied; and the **Spring template's DB is MariaDB, not Postgres**.

**Net:** Spring wins for a *standalone eng-grade auth-gated service* (Guardian + instantiation + coverage CI shipped) but carries a migrations gap and half-wired Kafka — it's the **graduation** target (§10), not the self-serve default. FastAPI is leaner and best-instrumented with real Postgres migrations, but its **total absence of Guardian is the single largest net-new cost**. The **incumbent TS/Express stack is the only option that already has Guardian + DB + migrations + queue + cron all wired and in production**, and keeps front-and-back in one language for Claude Code — the reason to make it the self-serve backend default.

### Recommendation

Adopt the **incumbent TS/Express BFF stack** as the self-serve backend standard, grounded in these three repos:
- **Auth recipe:** the Guardian-App-Starter-Kit `requireAuth` + per-downstream typed client + `local/require-auth-on-routes` ESLint rule (+ SMC's `authorize()`/API-key/webhook paths when the preset needs them).
- **Data + async at scale:** SMC's Drizzle/Postgres + Kafka + node-cron patterns (prefer versioned `drizzle-kit` migrations for self-serve).
- **The `.agents/skills/` model:** ship `guardian-auth` / `api-integration` as backend skills in `AGENTS.md`, exactly as the frontend ships `create-component-ho`/`generate-ui` — so Claude Code *follows the skill* to wire auth and downstreams rather than reinventing them.

Keep **FastAPI** as the explicit alternative only if the platform team wants Python for a class of tools (accepting a net-new Guardian build), and **Spring/Kotlin** as the §10 graduation target for hardened standalone services. Two open plumbing items this hands to §11: **deploy pipeline** (AWS/ODE incumbent vs Railway) and **versioned-migration policy** (`drizzle-kit` migrate vs `push`).

---

## 6. The 10-question checklist

The scope agent asks these in conversation; the answers select the preset and flags. This is the entire decision — no judgment calls left at generation time.

| # | Question | Decides |
|---|---|---|
| 1 | Who uses it, roughly how many? | Tier now + graduation clause (§10) |
| 2 | Does it only display information, or also create/edit data? | Whether a database exists at all |
| 3 | Where does that data live today? (internal service / BigQuery / nowhere yet) | Proxy vs warehouse-read vs own DB |
| 4 | Is every record the same shape, or does it vary per record? | Postgres (structured/repeatable) vs MongoDB (unstructured/non-repeatable) |
| 5 | How much data, growing how fast? | OLTP vs warehouse; pagination/indexing posture |
| 6 | How fresh must what's on screen be? | Polling (default) vs SSE vs "are you sure" (WebSocket → §10 check) |
| 7 | Anything slow (>5s), scheduled, or needing retries? | Async tier: none → BackgroundTasks → Celery+SQS → cron-only |
| 8 | Which third-party services, and what are their rate limits? | Queue-forcing, fallback plan (a rate limit can force async even when nothing else does) |
| 9 | Who may see/do what? | Guardian depth: any-Headouter → role-gated (VIEW/EDIT) → row-level |
| 10 | Throwaway experiment or durable tool? | CI/test/observability rigor |
| — | *Interface check (from the conversation, not asked):* is this a web app, a Slack bot, an agent-callable service, a browser extension, or a scheduled report? | Interface module(s) — a tool can be more than one |

---

## 7. The scaffold catalogue

Every preset composes from the same module library (§8) on top of the fixed base (§5). For each: what the user asked for, what feature module they get, and why.

### Preset 1 — `viewer`

> *"I want a dashboard that shows [bookings / vendor status / QA runs] — the data already exists in our systems."*

**Real examples found:** VFS Dashboard, Booking Analytics Hub.

**They get:** a feature module in the monorepo shaped as:
```
apps/<name>/   (or features/<name>/)
├── frontend/          Vite + React + TS · headauth · ExperienceOS DS · TanStack Query (polling)
├── backend/           FastAPI (pending confirm): Guardian dependency + proxy routes ONLY
│   └── app/downstreams/<svc>/    typed client, forwards the user's Ory cookie
└── route registered + Guardian role gate for the requesting user/group
```
(Shared `packages/`, compose, Railway, AGENTS.md live at monorepo root — not duplicated per module.)

**No database. No queue. Nothing else.**

**Why:** The data already lives in an internal service — provisioning a database here creates a stale mirror plus a sync job nobody owns (the single most common over-provisioning mistake). The backend still exists even though it's thin: the browser must never call downstream services directly; the BFF forwards the user's session cookie so downstream services see the real user (the established Guardian BFF pattern). This is the smallest scaffold and the one most Gate-0 survivors should land on.

**Not this if:** the data lives in BigQuery → preset 2. The user needs to *edit* anything → preset 3.

---

### Preset 2 — `warehouse-dashboard`

> *"I want a dashboard over our metrics/funnel/historical data."* (Data lives in BigQuery.)

**Real examples found:** Ops Command Centre, Biz Data Analyst, Data Correlation Engine.

**They get:** preset 1 **plus**
```
├── backend/app/warehouse/     BigQuery read-only client + per-query bytes-billed cap
├── backend/app/cache/         Redis TTL cache — mandatory, not optional
└── (flag) async=cron          scheduled materialization job, if queries are slow/costly
```

**Why:** Read-only BigQuery credentials scope the blast radius. The cache is a **cost control**, not an optimization — an uncached dashboard re-scanning warehouse tables on every page load is how BigQuery bills explode; the bytes-billed cap is the backstop. Copying warehouse data into an app database is explicitly not offered, for the same stale-mirror reason as preset 1.

**Not this if:** it's standard BI slicing with no custom logic → Gate 0 routes to Retool/Looker/Hex before this preset is ever reached.

---

### Preset 3 — `crud-admin`

> *"I want a tool where my team can create, track and edit [candidates / vendor mappings / requests]."* (New data, uniform shape.)

**Real examples found:** BOB-BizOps Tool, Assortment Mapper, Candidate NPS.

**They get:** preset 1 **plus**
```
├── backend/
│   ├── app/models/            SQLModel entities
│   ├── app/alembic/           migrations
│   └── app/api/routes/        CRUD endpoints, standardized error shape
├── frontend/src/forms/        umbreon `Form` primitive (TanStack Form) + Zod, validated both sides
│                              (raw @tanstack/react-form is ESLint-banned — use the Form primitive)
└── docker-compose.yml         + local Postgres
```

**Why Postgres as the default when new data exists:** the data in these tools is relational (entities that reference each other, needs transactions), the org runs managed Postgres, migrations are explicit (schema errors surface at migration time where Claude Code can see and fix them), and SQL is the strongest data language for LLM-assisted builders. Authorization is generated at the depth Q9 answered — most tools need only "any Headouter"; role-gating machinery (Guardian VIEW/EDIT resources) is added only when actually requested, because unused authz scaffolding is noise the builder has to work around.

**Not this if:** each record has a different shape → preset 5. There are multi-step flows/approvals → preset 4.

---

### Preset 4 — `workflow-console`

> *"I want a tool that takes [an onboarding / a request / an invoice] through steps: draft → review → approved, with reminders."*

**Real examples found:** Blueprint (onboarding command centre), HiringOS, Finance's invoice generation tool.

**They get:** preset 3 **plus**
```
├── backend/app/workflow/      status column + validated transitions (state machine pattern)
├── backend/app/tasks/         async tier 1 (BackgroundTasks: notify on transition)
│                              or tier 2 (Celery + SQS: scheduled reminders, retries)
├── backend/app/integrations/slack/    webhook notify (default ON for this preset)
└── frontend/                  umbreon `WizardPage` + `WizardStepRail` (both shipped
                               in @headout/umbreon — verified §5a), autosaved drafts
                               ✓ multi-step wizards ARE genericized in the DS — compose
                               them, don't build a one-off shell. (Corrects the earlier
                               "wizard not genericized" assumption.)
```

**Why:** Every real workflow tool we found needed the same three things beyond CRUD — draft state, validated transitions, and "tell someone in Slack." The async tier is chosen by Q7, not defaulted: notify-on-save is `BackgroundTasks` (zero infra); "remind the approver after 48h" needs Celery+SQS — the pattern `dior` already runs in production. Temporal is deliberately absent: human-in-the-loop waits measured in days, with replay guarantees, is the §10 graduation boundary.

---

### Preset 5 — `doc-store`

> *"I want to store and manage [vendor payloads / scraped content / configs] — every record looks different."*

**Real examples:** vendor-payload ingestion tools; org precedent for document storage: `payload`, `athena`.

**They get:** preset 3 or 4 with **MongoDB (Motor/Beanie) replacing Postgres+Alembic**.

**Why, and why gated hard:** Mongo is right when records genuinely vary per source and are read whole (vendor A's payload shares no schema with vendor B's). But schemaless storage is a footgun for non-technical builders — drift is silent, and there's no migration step to catch mistakes. So this preset is only selected when Q4's answer is unambiguous, never as an escape from schema design. Uniform data always goes to preset 3.

---

### Preset 6 — `automation-service`

> *"I want something that [syncs listings / processes vouchers / reconciles records] automatically — nobody really needs a UI."*

**Real examples found:** `las` (Listing Automation Service), TTD-Automation-Suite, Pompeii Voucher Generator. Production pattern: `dior`.

**They get:** a backend-only feature module (optionally a status page):
```
apps/<name>/
├── backend/
│   ├── app/api/routes/        trigger + status endpoints (Guardian service-key auth)
│   ├── app/tasks/             Celery + SQS workers, beat schedules
│   ├── app/ratelimit/         per-third-party limits from Q8, with backoff
│   └── app/integrations/      zendesk / email / sheets-export as selected
└── (monorepo root)            Postgres (job state) + Redis + local SQS in compose;
                               api + worker as separate Railway services
```
**No frontend** (optionally a single status page).

**Why:** This shape is queue-first: the third-party rate limits from Q8 *are* the architecture (they dictate queue concurrency and backoff). Job state lives in Postgres so runs are auditable. The Gate-0 check matters most here — generate-and-send automations route to **Zeps first**; this preset exists only for orchestration beyond Zeps' connector set.

---

### Preset 7 — `slack-bot`

> *"I want a bot in our channel that [triages bugs / answers questions / files tickets]."*

**Real examples found:** bar (Slack→Jira), Wanda (on-call triage), genie, optimus; delphi and PlatoBot are the engineering-grade versions of this shape.

**They get:** a Slack-facing feature module:
```
apps/<name>/
├── backend/
│   ├── app/slack/             python slack-bolt: event handlers, slash commands, threads
│   ├── app/models/            Postgres — or the Sheets adapter where the team's
│   │                          source of truth already IS a sheet (bar's on-call roster)
│   └── app/tasks/             tier 1 async (acknowledge fast, work in background)
└── (flag) --llm               Anthropic client + retries + cost logging, if conversational
```

**Why python slack-bolt:** keeps the one-backend-language rule (PlatoBot precedent), so a Slack bot and its background jobs are one codebase in one language. Slack workspace membership provides the implicit user identity; Guardian service auth covers anything the bot calls downstream. The Sheets adapter is offered deliberately: for some ops teams the sheet *is* the database, and pretending otherwise drives them back to shadow-IT.

---

### Preset 8 — `mcp-server`

> *"I want our [incidents / talent data / catalog] to be queryable by AI agents."*

**Real examples found:** aviator, argus-mcp, porygon-mcp, talentmcp, headout-mcp-server — this is already a well-worn shape at Headout.

**They get:** an MCP feature module:
```
apps/<name>/
├── backend/
│   ├── app/mcp/               FastMCP server: tools, resources
│   ├── app/auth/              bearer service-key (the pattern oak/delphi use)
│   └── app/downstreams|models/   whichever data module Q3 selected
└── README.md                  includes the claude mcp add / .mcp.json snippet
```

**Why:** Agent-callable data is its own interface modality, not a web app variant — no UI, bearer-token auth, and the deliverable includes the connection snippet because "how do I add it to Claude" is the entire adoption step. Registered into the Storefront catalogue as an MCP so discovery finds it before someone builds a duplicate.

---

### Preset 9 — `ai-tool`

> *"I want a tool where users [upload images and get variants / paste text and get analysis] — powered by AI."*

**Real examples found:** Spectra Image Gen, Combo Split Image Generation, ResumeRanker. *(Note: many requests in this shape are really Claude-skill modality and route out at Gate 0 — this preset is for the ones needing multi-user state, uploads, or queues.)*

**They get:** preset 3 **plus**
```
├── backend/app/llm/           Anthropic client · streaming (SSE) · timeouts/retries
│                              · per-request cost logging
├── backend/app/media/         S3 presigned uploads (images/files never transit the backend)
├── (flag) data=pgvector       embeddings, ONLY after the RAG check below
└── (flag) async=tier2         generation jobs > ~60s go through the queue
```

**Why the RAG check:** `compass`/`travelsage` — a "Headout Unified RAG API" — already exists. The rag flag first wires to it; a self-hosted pgvector stack is generated only if that service can't serve the use case. Same discover-before-build principle as Gate 0, applied inside the scaffold. Cost logging is default-on because LLM tools are the one preset where a bug turns directly into spend.

---

### Preset 10 — `reporter`

> *"I want a weekly summary of [metrics / anomalies / activity] posted to our channel."*

**Real examples found:** metricbot shape; several "dashboards" in the audit are really this — nobody visits them, they want the push.

**They get:** a cron-only feature module (no web UI):
```
apps/<name>/
├── backend/
│   ├── app/jobs/report.py     the report: query → render → deliver
│   ├── app/warehouse/         BigQuery RO + bytes cap (or internal-proxy)
│   └── app/integrations/      slack-notify / email / sheets-export
└── railway cron schedule      — NO web service at all
```

**Why this exists as its own preset:** the output *is* the product. Scaffolding a web app around a weekly digest creates a UI nobody visits and a server that idles 167 hours a week. Cron + query + deliver is the honest architecture, and it's dramatically cheaper to run and maintain.

---

### Preset 11 — `extension`

> *"I want a button/overlay inside [the pages we already work in]."*

**Real examples found:** metaview, nexus, alan, open-mb-in-localhost.

**They get:**
```
apps/<name>/
├── extension/                 TS + Manifest v3, build to unpacked/store zip
└── backend/                   OPTIONAL — only if it needs server state
                               (then: shared backend + Guardian, per the fixed standards)
```

**Why:** Sometimes the right UI is inside an existing page, not a new app. Kept deliberately minimal; if the extension needs real server state it composes the standard backend modules rather than inventing its own.

---

### Catalogue summary

| # | Preset | Interface | Data | Async | The one-line reason |
|---|---|---|---|---|---|
| 1 | viewer | web | none | — | data already exists; don't mirror it |
| 2 | warehouse-dashboard | web | BigQuery-RO + cache | cron opt. | warehouse reads need cost guards, not copies |
| 3 | crud-admin | web | Postgres | tier 0–1 | new relational data → explicit schema + migrations |
| 4 | workflow-console | web | Postgres | tier 1–2 | drafts + transitions + notify is its own shape |
| 5 | doc-store | web | MongoDB | tier 0–1 | per-record-variable data only; gated |
| 6 | automation-service | headless API | Postgres + Redis | tier 2 | rate limits are the architecture |
| 7 | slack-bot | Slack | Postgres/Sheets | tier 1 | the channel is the UI |
| 8 | mcp-server | MCP | any adapter | — | agents are the user |
| 9 | ai-tool | web | Postgres + S3 (+pgvector) | tier 2 | streaming, uploads, cost control |
| 10 | reporter | none (cron) | BigQuery-RO | cron | the output is the product |
| 11 | extension | browser | none/backend opt. | — | the UI belongs inside an existing page |

---

## 8. The monorepo + generator

> **Concrete structure: see `SCAFFOLD-MONOREPO.md`.** That doc clarifies the model below: the monorepo is a **template/catalogue source we look up and carve from**, not a live deployed monorepo. The generator composes base + preset + modules and **emits a standalone repository** the requester owns (framework arrives as versioned `@headout/*` deps; app files are generated source). The single-live-monorepo framing below is retained for context but is superseded by that doc.

**Decision (ExperienceOS sync):** a **single shared monorepo** for internal tools, not N separate repos per problem statement.

> **Reality check (§5a):** ExperienceOS today is *not* this shape — it's a **git-submodule monorepo** stitching separate repos (`mmp-builder`, `supply-mission-control`), each with its own `client/` + `server/` + `packages/design-system/`. The `apps/`+`packages/` single-workspace layout below is the **proposed** consolidation target, not existing fact. Reuse ExperienceOS's *internal* conventions (umbreon DS, Express BFF, auth modules, token pipeline) as the reference; the workspace topology is still ours to stand up.

- Each problem statement becomes a **feature module** with its own dedicated route.
- Routes are protected via **Guardian roles** tied to the requesting user/group.
- **One** build and deployment pipeline; OD support comes out of the box.
- Shared `packages/` for the ExperienceOS design system, ESLint rules, common utils, and shared business logic.
- ExperienceOS and Bob are consolidation candidates (discussed with the platform team); Orbit and peers can follow.

The generator still composes modules — but it **adds a feature folder + route into the monorepo**, it does not mint a new GitHub repo per request.

```
headout/internal-tools   (working name — finalize with the platform team)
├── apps/                     or features/ — one folder per problem statement
│   └── <name>/               route + UI + (optional) API slice for that tool
├── packages/
│   ├── design-system/        ExperienceOS DS (thematic, data-intensive primitives)
│   ├── eslint-config/        semantic tokens · Flex/Container/Grid over raw div
│   ├── utils/                shared helpers
│   └── business-logic/       cross-tool domain logic as it emerges
├── backend/                  shared API service — TS/Express BFF (grounded, §5b; Guardian+Drizzle+Kafka+cron)
│   ├── auth/                 guardian · rbac · service-key
│   ├── data/                 postgres · mongo · bigquery-ro · redis-cache · …
│   ├── async/                tier1-background · tier2-celery · cron
│   └── …
├── scaffold/                 generate.py: answers.json → new feature module
│   └── scaffold.config.schema.json
├── docker-compose.yml · railway.toml · AGENTS.md · HeadoutAgentsConfig
└── docs/                     DECISION-FRAMEWORK · QUESTIONS · GRADUATION · COMPONENT-REQUESTS
```

Presets remain pre-filled `answers.json` files — additive. Headless presets (automation-service, slack-bot, mcp-server, reporter) may still land as backend-only modules or sibling services in the same monorepo rather than separate GitHub repos.

**Starting point:** use the existing **ExperienceOS repo** implementation as the reference for design-system usage patterns before scaffolding the new monorepo layout.

---

## 9. Component gaps — don't block delivery

`@headout/umbreon` coverage is strong for data-intensive UIs (~60 components, §5a); it is **not** complete for every pattern scaffolding will need. But ExperienceOS already has a **real, documented governance model** — use it rather than inventing one.

**The governance that actually exists** (`docs/design-system-governance.md`, verified §5a):
- **Layers:** `tokens/` (source of truth) → `primitives/` (reusable controls) → `layouts/` (page shells). `components/ui/` is **legacy, frozen, deprecated** — enforced by ESLint `local/no-new-legacy-ui-imports` + a shrinking `legacy-ui-import-allowlist.json` (migrate-on-touch; never add entries).
- **Stability levels:** Stable (tokens, proven primitives, layouts) · Emerging (primitives still being proven in Storybook) · Legacy.
- **Extend vs compose:** compose from existing primitives for feature-specific assemblies; add a **new primitive** only when the behavior is reused across >1 feature, needs a consistent API, or carries a11y/interaction logic that shouldn't be reimplemented; add a **new layout** when a page structure repeats across routes.
- **Change intake before adding anything:** (1) check `primitives/` + `layouts/` for a fit, (2) confirm the token contract in `tokens.css`, (3) document usage in Storybook when the API becomes reusable.

> **Correction:** the earlier "multi-step forms aren't genericized" gap is **closed** — `WizardPage` + `WizardStepRail` ship in umbreon (§5a). And the "voting/upvote" prioritization was a **sync proposal that is not implemented** in the repo; the governance above is what's real. Keep upvoting as an *idea* if the platform team wants it, but don't cite it as existing.

**When Claude/AI genuinely hits a pattern with no umbreon equivalent:**
1. Ship a **temporary feature-local component** so delivery isn't blocked. Mark it non-standards-compliant / pending-DS.
2. Follow the **change-intake** path above; if it clears the "add a new primitive/layout" bar, propose it into umbreon (tracked, not informal Slack), not a permanent local one-off.
3. Resolution is **asynchronous** — replace the temporary component when umbreon lands the official one; ESLint should forbid the temporary pattern once the real primitive exists (mirrors the legacy-UI freeze mechanism).

This process belongs in `AGENTS.md` and the scope agent's handoff so builders don't silently invent permanent one-offs.

---

## 10. Graduation — when a tool outgrows self-serve

Scaffolded tools are born in the self-serve tier inside the monorepo. Three triggers, stated in every generated module's docs, move a tool to engineering ownership:

1. **Scale:** sustained users beyond roughly the low hundreds. At that point it is a product, not a micro-tool — and it should land on engineering's conventions (Next.js App Router where SSR/product-surface standards apply; Kotlin/Spring Boot where a hardened service is warranted). Self-serve internal tools stay on **React + Vite**.
2. **Criticality:** revenue-touching, cross-team writes, or a failure that pages someone.
3. **Architecture:** the moment a requirement needs Temporal-grade durable orchestration, WebSocket collaboration, or a Claude-agent harness — these are flagged by the generator itself, not discovered later.

Graduation is a planned handoff (the tool already has CI, migrations, structured logs, and org agent-config), not a rewrite-from-scratch — that is much of the point of scaffolding. Extracting a hot feature module into its own eng-owned service is an allowed graduation path; inventing a parallel shadow stack is not.

---

## 11. What we need from the platform team

**Approvals:**
1. The fixed standards (§5) — in particular *Guardian-always*, *React + Vite for internal tools*, *`@headout/umbreon` design system + ESLint* (all verified live, §5a), *TS/Express backend* (verified full-stack-capable, §5b), and the monorepo/feature-module model. **Backend is no longer an open capability question — the incumbent TS/Express stack is proven in production (§5b) and recommended as the self-serve default.** What's left for the platform team is the *ownership + deploy* call, not the language: (a) bless TS/Express as the standard (vs keep FastAPI/Python as an alt), (b) deploy pipeline — incumbent AWS/ECR/Medusa-ODE vs Storefront's Railway proposal, (c) versioned-migration policy (`drizzle-kit` migrate vs `push`).
2. The 11 preset compositions (§7) — or tell us which to cut/merge for v1. Our own suggestion for a minimal v1: presets **1, 2, 3, 4, 7, 10** cover everything the audit actually found; 5, 6, 8, 9, 11 can follow.
3. The component-gap process (§9) and graduation policy (§10).

**Build/provision items (blocking):**

| Item | Status | Needed from platform |
|---|---|---|
| Backend stack — bless TS/Express as the self-serve standard | **Grounded (§5b); ownership call open — platform team** (ExperienceOS owners) | Capability is settled: SMC proves TS/Express runs a full CRUD backend (Postgres+Drizzle, Kafka, cron, BigQuery, RBAC). Confirm it as the standard vs keeping FastAPI/Python as an alt; DB default is **Postgres** (Mongo only per §5 data-shape rule) |
| Deploy pipeline for the monorepo | **Open — decision needed** | Incumbent ships Docker→AWS ECR + Medusa ODE (§5b), Storefront proposed Railway (§5). Pick one for the self-serve tier, or run Railway for self-serve + AWS/ODE at graduation (§10) |
| Versioned-migration policy | **Open — decision needed** | SMC uses hand-authored SQL, Guardian-App-Starter-Kit uses `drizzle-kit push`. Recommend versioned `drizzle-kit` migrations for self-serve (errors surface where Claude Code can fix them) |
| Guardian session-validation dependency for the chosen backend | **Exists, running, in TS today** (Guardian-App-Starter-Kit `requireAuth` + SMC `authenticate`/`authorize` RBAC/API-key/webhook paths, §5b); also proven in Kotlin (`GuardianAuthFilter`). **Net-new only if we pick Python/FastAPI** (the FastAPI template has *no* Guardian — only header telemetry). | Bless the TS BFF auth recipe (+ ship `guardian-auth`/`api-integration` as backend skills), or greenlight building the FastAPI one |
| `@headout/umbreon` DS + ESLint rules as shared `packages/` | **Published package + enforced ESLint rules already exist** in ExperienceOS (§5a) | Publish/registry access for scaffold agents; token/consumption path outside the ExperienceOS repo |
| Railway project provisioning (monorepo pipeline) | — | Org-level flow so the shared deploy works; OD support expected from one pipeline |
| BigQuery read-only service accounts | — | Per-tool RO service-account flow with bytes-billed cap as policy |
| Component-request + upvote track | Proposed | Design/platform owner for the queue; don't block feature delivery |
| Shared internal-tools monorepo | To be stood up from ExperienceOS patterns | Ownership with the platform team; Storefront scaffolds feature modules into it |

**What already exists and is reused, not rebuilt:** `@headout/umbreon` (ExperienceOS DS — published package, ~60 components, enforced ESLint rules, token pipeline, AI UI-gen skills — §5a); the incumbent **TS/Express backend** verified in production (§5b) — `supply-mission-control` (full CRUD: Postgres+Drizzle, Kafka, node-cron, BigQuery, S3, Guardian+RBAC), `mmp-builder` (thin-BFF reference), and `Guardian-App-Starter-Kit` (the Guardian/Ory + BFF recipe codified as `.agents/skills/` — `guardian-auth`, `api-integration`); `@headout/headauth` (frontend Guardian auth); `python-fastapi-template` (backend *alternative* — Postgres+Alembic, **no Guardian**, only if we go Python); `spring-boot-service-template` (Guardian built-in, MariaDB, §10 graduation target); `HeadoutAgentsConfig`, `compass` (RAG API), Slack-bolt (PlatoBot/bar), MCP-server pattern (aviator/argus-mcp).

---

## 12. Next steps (from scaffolding sync)

| Action | Owner | Notes |
|---|---|---|
| **Connect with the platform team on backend architecture** | Anish | Capability is now grounded (§5b) — the incumbent TS/Express stack does it all. The meeting is narrower: bless TS/Express as the standard (vs FastAPI alt), pick the deploy pipeline (AWS/ODE vs Railway), and the migration policy. |
| **Review shared architecture doc and flag gaps** | Platform / reviewers | Anish shares the doc covering scenario buckets and folder structures per problem-statement type — this taxonomy is that doc's Storefront-facing twin; flag mismatches. |
| **Reference ExperienceOS repo for DS usage patterns** | Scaffold builders | Starting point before standing up the new monorepo; do not invent a parallel component vocabulary. |

---

## Appendix A — evidence and method

- **Replit audit (2026-07-13):** full inventory of the "Headout Workspace" Replit Teams org — 39 tools, categorized by function; several confirmed abandoned by their owners.
- **GitHub survey:** all 535 `headout` org repos enumerated; forks/archived excluded; READMEs fetched and read for all 488 active candidates (393 had real content); the load-bearing repos (`headauth`, `python-fastapi-template`, `spring-boot-service-template`, `next-template`, `Guardian-App-Starter-Kit`, ExperienceOS, `recon`, `dior`, `las`, MCP servers, Slack bots) read in full — trees, source files, and skills, not just descriptions.
- **ExperienceOS scaffolding sync (2026-07-13):** frontend = React + Vite (not Next.js for internal tools); ExperienceOS DS + custom ESLint; single monorepo / feature modules; component-gap + upvote process; backend decisions pending platform-team sign-off (FastAPI vs alternatives, Postgres vs Mongo, cron, BigQuery).
- **ExperienceOS repo read (2026-07-13, §5a):** the sync above cross-checked against the real `headout/experienceos` + `mmp-builder` submodules — trees, `package.json`, `packages/design-system/COMPONENTS.md`, `docs/design-system-governance.md`, `scripts/eslint-design-system-rules.mjs`, `server/middleware/`, and the `.claude/skills/` UI-gen tooling read directly. This corrected four earlier assumptions: DS is `@headout/umbreon` (named + published); backend is **Express/TS**, not FastAPI; multi-step wizards **are** genericized (`WizardPage`/`WizardStepRail`); and the component-gap "upvote" model is unimplemented — the repo uses a documented primitives/layouts/legacy-freeze governance instead.
- **ExperienceOS backend read (2026-07-14, §5b):** the backend twin of the §5a frontend read. Four repos read directly via `gh api` — `supply-mission-control` (entry/app assembly, `database/postgres/schema/*`, `database/init/*.sql`, `middleware/auth/*`, Kafka consumers, `node-cron` schedulers, config), `mmp-builder` `server/*` (middleware, auth module, dev api-proxy), `Guardian-App-Starter-Kit` (`api-server` `requireAuth` + downstream clients + `.agents/skills/`, Drizzle `@workspace/db`, Orval config, Replit coupling), and both templates (`python-fastapi-template` auth/DB/CI, `spring-boot-service-template` `GuardianAuthFilter`/`init.sh`). This resolved the backend from "OPEN — FastAPI pending" to "grounded TS/Express incumbent," and corrected four things: mmp-builder's api-proxy is **dev-only** (not the production BFF — §5a wording fixed); the real forwarding BFF is SMC + Guardian-App-Starter-Kit; the FastAPI template's Docker→ECR/semver CI is **disabled by default**; the Spring template's DB is **MariaDB, not Postgres**.
- **Precedent mapping:** every pattern this document relies on is anchored to a named, verified repo where possible (listed inline in §5–§7). Where something does **not** exist, it is called net-new / pending (§11) rather than assumed.
- **Methodology source:** the build process embedded in every scaffold's `AGENTS.md` is the Applied AI team's `Building-a-scaled-app.md` (PRD → prototype + crux → system design → ERD → chunked implementation).
- **Known open items:** why the three finance reconciliation tools bypassed `recon`'s existing Retool UI has not been confirmed with Finance — if that UI is inadequate, the right fix may be improving `recon`'s front-end rather than treating this purely as a discovery failure. Flagged for follow-up rather than asserted.

# Storefront Scaffolding — Taxonomy & Scaffold Catalogue

**Status:** Proposal — for platform team review and approval
**Owner:** Anish Adamane (Storefront workstream)
**Date:** 2026-07-13

---

## 1. What this document is

Storefront is the front door for internal tools at Headout. When someone asks it for a tool, it first checks whether the tool already exists, then whether it should be built at all — and if the answer is "build it as an app," Storefront hands the requester a **scaffolded GitHub repo** they build on with Claude Code. Most requesters are non-technical.

This document defines that scaffolding system end to end:

1. **Gate 0** — which requests never become apps, and where they route instead (§4)
2. **The fixed standards** baked into every scaffold, and why (§5)
3. **The 10-question checklist** that turns a request into a specific scaffold (§6)
4. **The catalogue** — 11 scaffold presets: *if a user wants to build X, they get repo Y, because Z* (§7)
5. **The generator** that produces these repos (§8)
6. **The graduation policy** for tools that outgrow self-serve (§9)

**What we are asking the platform team to approve** (details in §10):

- The fixed standards in §5 (Guardian always; FastAPI whenever there is a backend; Eevee design system; Railway)
- The 11 preset compositions in §7
- Three items that need platform involvement to exist: a Guardian session-validation dependency for FastAPI (net-new), an `oak` MCP token provisioned to the scaffolder, and a provisioning flow for Railway projects + BigQuery read-only service accounts

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

## 3. How a request becomes a repo

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
GENERATOR composes the repo  (headout/app-scaffold, §8)
  → pushes new repo to github.com/headout/<name>
  → init.sh: renames placeholders, installs HeadoutAgentsConfig
    (common + frontend bundles), registers repo for shared agent config
        │
        ▼
User builds on it with Claude Code  →  review gate  →  Railway deploy
        │
        ▼
Tool auto-listed back into the Storefront catalogue
```

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
| Durable multi-service orchestration, human-in-the-loop waits over days, replay guarantees | **Engineering project** (pitch, not repo) | Temporal/K8s-grade work is beyond self-serve; see §9 |

Only what survives this gate reaches the checklist.

---

## 5. Fixed standards — in every scaffold, non-negotiable

These are the same regardless of which preset is chosen. Each exists for a reason we can defend:

| Standard | What, concretely | Why |
|---|---|---|
| **Auth = Guardian** | Web UIs: `@headout/headauth` (the org's published Ory auth package — session bootstrap, login redirect, session-lockout handling, 401 interceptor). APIs: a FastAPI dependency that validates the Ory session against Guardian `whoami`. **The FastAPI piece is net-new** — no Python/FastAPI Guardian integration exists in the org today (existing Python integrations are Django-only). | Every self-built tool we audited skipped auth because it was effort. Pre-wiring it makes the secure path the zero-effort path. One auth system also means one access-review surface for the platform team. |
| **Backend = FastAPI, always** | `python-fastapi-template` patterns: Pydantic v2, async SQLAlchemy/Alembic where a DB exists, `uv`, Ruff+mypy, Datadog APM, structured Coralogix JSON logging — all already in the template. | One backend language across all scaffolded tools means Claude Code (and any engineer who helps) debugs one stack. Kotlin/Spring Boot and Go remain the standards for engineering-built product/platform services — the scaffold docs point there rather than duplicating them (§9). |
| **UI = Headout design system** | `@headout/eevee` (components) + `pixie` (tokens) + `onix` (icons), with the design-system skill bundled into the repo at `.claude/skills/` (tokens, fonts, iconography — plus an addendum scoping out consumer-marketing voice for internal tools). Component work uses the `oak` MCP server; its token is provisioned once to the scaffolder, not per user. | Tools look like Headout tools with zero design effort from the builder, and design-system adoption comes free instead of being a migration later. |
| **Deploy = Railway** | `railway.toml` per repo; one or two services (frontend/backend); `docker-compose.yml` for local dev of whatever services the preset selected. | Already the Storefront platform decision; single deploy story for every scaffolded tool. |
| **Observability** | Coralogix JSON logging + `/health` + optional `/metrics` (Prometheus), error format standardized. | "It broke and nobody can see why" is the predictable failure mode of self-serve tools; this is the minimum that makes platform support possible. |
| **Agent config** | `init.sh` installs `HeadoutAgentsConfig` (common + frontend bundles: commit/PR/planning/debug skills, frontend rules) and registers the repo for ongoing sync. `AGENTS.md` embeds the **Building-a-scaled-app** methodology (PRD → prototype → system design → chunked implementation) plus this preset's conventions and the graduation triggers. | The builder's Claude Code session starts with org standards and a build process, not a blank slate. Configs stay in sync as org standards evolve instead of freezing at scaffold time. |

---

## 6. The 10-question checklist

The scope agent asks these in conversation; the answers select the preset and flags. This is the entire decision — no judgment calls left at generation time.

| # | Question | Decides |
|---|---|---|
| 1 | Who uses it, roughly how many? | Tier now + graduation clause (§9) |
| 2 | Does it only display information, or also create/edit data? | Whether a database exists at all |
| 3 | Where does that data live today? (internal service / BigQuery / nowhere yet) | Proxy vs warehouse-read vs own DB |
| 4 | Is every record the same shape, or does it vary per record? | Postgres vs MongoDB |
| 5 | How much data, growing how fast? | OLTP vs warehouse; pagination/indexing posture |
| 6 | How fresh must what's on screen be? | Polling (default) vs SSE vs "are you sure" (WebSocket → §9 check) |
| 7 | Anything slow (>5s), scheduled, or needing retries? | Async tier: none → BackgroundTasks → Celery+SQS → cron-only |
| 8 | Which third-party services, and what are their rate limits? | Queue-forcing, fallback plan (a rate limit can force async even when nothing else does) |
| 9 | Who may see/do what? | Guardian depth: any-Headouter → role-gated (VIEW/EDIT) → row-level |
| 10 | Throwaway experiment or durable tool? | CI/test/observability rigor |
| — | *Interface check (from the conversation, not asked):* is this a web app, a Slack bot, an agent-callable service, a browser extension, or a scheduled report? | Interface module(s) — a tool can be more than one |

---

## 7. The scaffold catalogue

Every preset composes from the same module library (§8) on top of the fixed base (§5). For each: what the user asked for, what repo they get, and why.

### Preset 1 — `viewer`

> *"I want a dashboard that shows [bookings / vendor status / QA runs] — the data already exists in our systems."*

**Real examples found:** VFS Dashboard, Booking Analytics Hub.

**They get:**
```
<name>/
├── frontend/          Vite + React + TS · headauth · Eevee · TanStack Query (polling)
├── backend/           FastAPI: Guardian dependency + proxy routes ONLY
│   └── app/downstreams/<svc>/    typed client, forwards the user's Ory cookie
├── docker-compose.yml · railway.toml · init.sh · AGENTS.md
```
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
├── frontend/src/forms/        React Hook Form + Zod, validated both sides
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
└── frontend/src/wizard/       multi-step form shell, autosaved drafts
```

**Why:** Every real workflow tool we found needed the same three things beyond CRUD — draft state, validated transitions, and "tell someone in Slack." The async tier is chosen by Q7, not defaulted: notify-on-save is `BackgroundTasks` (zero infra); "remind the approver after 48h" needs Celery+SQS — the pattern `dior` already runs in production. Temporal is deliberately absent: human-in-the-loop waits measured in days, with replay guarantees, is the §9 graduation boundary.

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

**They get:**
```
<name>/
├── backend/
│   ├── app/api/routes/        trigger + status endpoints (Guardian service-key auth)
│   ├── app/tasks/             Celery + SQS workers, beat schedules
│   ├── app/ratelimit/         per-third-party limits from Q8, with backoff
│   └── app/integrations/      zendesk / email / sheets-export as selected
├── docker-compose.yml         Postgres (job state) + Redis + local SQS
└── railway.toml               api + worker as separate Railway services
```
**No frontend** (optionally a single status page).

**Why:** This shape is queue-first: the third-party rate limits from Q8 *are* the architecture (they dictate queue concurrency and backoff). Job state lives in Postgres so runs are auditable. The Gate-0 check matters most here — generate-and-send automations route to **Zeps first**; this preset exists only for orchestration beyond Zeps' connector set.

---

### Preset 7 — `slack-bot`

> *"I want a bot in our channel that [triages bugs / answers questions / files tickets]."*

**Real examples found:** bar (Slack→Jira), Wanda (on-call triage), genie, optimus; delphi and PlatoBot are the engineering-grade versions of this shape.

**They get:**
```
<name>/
├── backend/
│   ├── app/slack/             python slack-bolt: event handlers, slash commands, threads
│   ├── app/models/            Postgres — or the Sheets adapter where the team's
│   │                          source of truth already IS a sheet (bar's on-call roster)
│   └── app/tasks/             tier 1 async (acknowledge fast, work in background)
├── (flag) --llm               Anthropic client + retries + cost logging, if conversational
└── docker-compose.yml · railway.toml
```

**Why python slack-bolt:** keeps the one-backend-language rule (PlatoBot precedent), so a Slack bot and its background jobs are one codebase in one language. Slack workspace membership provides the implicit user identity; Guardian service auth covers anything the bot calls downstream. The Sheets adapter is offered deliberately: for some ops teams the sheet *is* the database, and pretending otherwise drives them back to shadow-IT.

---

### Preset 8 — `mcp-server`

> *"I want our [incidents / talent data / catalog] to be queryable by AI agents."*

**Real examples found:** aviator, argus-mcp, porygon-mcp, talentmcp, headout-mcp-server — this is already a well-worn shape at Headout.

**They get:**
```
<name>/
├── backend/
│   ├── app/mcp/               FastMCP server: tools, resources
│   ├── app/auth/              bearer service-key (the pattern oak/delphi use)
│   └── app/downstreams|models/   whichever data module Q3 selected
├── README.md                  includes the claude mcp add / .mcp.json snippet
└── railway.toml
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

**They get:**
```
<name>/
├── backend/
│   ├── app/jobs/report.py     the report: query → render → deliver
│   ├── app/warehouse/         BigQuery RO + bytes cap (or internal-proxy)
│   └── app/integrations/      slack-notify / email / sheets-export
├── railway.toml               cron schedule — NO web service at all
└── AGENTS.md
```

**Why this exists as its own preset:** the output *is* the product. Scaffolding a web app around a weekly digest creates a UI nobody visits and a server that idles 167 hours a week. Cron + query + deliver is the honest architecture, and it's dramatically cheaper to run and maintain.

---

### Preset 11 — `extension`

> *"I want a button/overlay inside [the pages we already work in]."*

**Real examples found:** metaview, nexus, alan, open-mb-in-localhost.

**They get:**
```
<name>/
├── extension/                 TS + Manifest v3, build to unpacked/store zip
└── backend/                   OPTIONAL — only if it needs server state
                               (then: FastAPI + Guardian, per the fixed standards)
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

## 8. The generator — `headout/app-scaffold`

One repo produces all of the above. **A generator, not N template repos**, because GitHub's "Use this template" can't compose modules — and the catalogue is exactly that: ~7 interface modules × ~7 data modules × 4 async tiers × add-on flags, sharing one base.

```
headout/app-scaffold
├── cli/                      generate.py: answers.json → new composed repo
├── scaffold.config.schema.json   the contract the Storefront scope agent fills
├── base/                     CI, init.sh, AGENTS.md template, railway/compose templates
├── interfaces/               web-spa · web-next · slack-bot · mcp-server ·
│                             chrome-extension · api-only · reporter
├── backend/fastapi-core/     config · logging · health · error format
├── auth/                     guardian-web · guardian-api · guardian-rbac ·
│                             row-level · service-key
├── data/                     postgres · mongo · bigquery-ro · redis-cache ·
│                             s3-media · pgvector · sheets
├── async/                    tier1-background · tier2-celery · cron
├── realtime/                 polling · sse · websocket(warned)
├── ai/                       llm · rag(wires to compass first) · agent(flagged → §9)
├── integrations/             internal-proxy · slack-notify · zendesk · email · sheets-export
├── observability/            logging · metrics · alerts
└── docs/                     DECISION-FRAMEWORK.md · QUESTIONS.md · GRADUATION.md
```

Presets are pre-filled `answers.json` files — adding a preset or module is additive and doesn't touch existing ones.

---

## 9. Graduation — when a tool outgrows self-serve

Scaffolded tools are born in the self-serve tier. Three triggers, stated in every generated `AGENTS.md`, move a tool to engineering ownership:

1. **Scale:** sustained users beyond roughly the low hundreds. At that point it is a product, not a micro-tool — and it should land on engineering's conventions (Next.js App Router on the frontend, per the consumer-side standard; Kotlin/Spring Boot where a hardened service is warranted). The `web-next` interface module exists so engineering-owned-from-day-one tools can also be scaffolded.
2. **Criticality:** revenue-touching, cross-team writes, or a failure that pages someone.
3. **Architecture:** the moment a requirement needs Temporal-grade durable orchestration, WebSocket collaboration, or a Claude-agent harness — these are flagged by the generator itself, not discovered later.

Graduation is a planned handoff (the tool already has CI, migrations, structured logs, and org agent-config), not a rewrite-from-scratch — that is much of the point of scaffolding.

---

## 10. What we need from the platform team

**Approvals:**
1. The fixed standards (§5) — in particular *Guardian-always* and *FastAPI-as-the-only-scaffolded-backend*.
2. The 11 preset compositions (§7) — or tell us which to cut/merge for v1. Our own suggestion for a minimal v1: presets **1, 2, 3, 4, 7, 10** cover everything the audit actually found; 5, 6, 8, 9, 11 can follow.
3. The graduation policy (§9).

**Build/provision items (blocking):**

| Item | Status | Needed from platform |
|---|---|---|
| Guardian session-validation dependency for FastAPI | **Net-new** — no Python/FastAPI Guardian integration exists (existing Python usage is Django-only). Logic is proven in Kotlin (`GuardianAuthFilter`) and Express (`requireAuth`); this is a port. | Review of the implementation; agreement it becomes the blessed pattern |
| `oak` MCP token for the scaffolder | oak exists and serves the design system | One provisioned token for the scaffold/build environment |
| Railway project provisioning | — | An org-level flow (or API token) so the generator can create projects/services |
| BigQuery read-only service accounts | — | A per-tool RO service-account flow with the bytes-billed cap as policy |
| `headout/app-scaffold` repo | To be built | Ownership/maintenance agreement — Storefront builds v1; long-term home to be agreed |

**What already exists and is reused, not rebuilt:** `@headout/headauth` (frontend Guardian auth), `python-fastapi-template` (backend base), the `eevee` design-system monorepo + `oak`, `HeadoutAgentsConfig` (agent config install/sync), `compass` (RAG API), the Celery+SQS pattern (`dior`), the Slack-bolt pattern (PlatoBot/bar), the MCP-server pattern (aviator/argus-mcp), and `spring-boot-service-template` (pointed to for engineering-grade services).

---

## Appendix A — evidence and method

- **Replit audit (2026-07-13):** full inventory of the "Headout Workspace" Replit Teams org — 39 tools, categorized by function; several confirmed abandoned by their owners.
- **GitHub survey:** all 535 `headout` org repos enumerated; forks/archived excluded; READMEs fetched and read for all 488 active candidates (393 had real content); the load-bearing repos (`headauth`, `python-fastapi-template`, `spring-boot-service-template`, `next-template`, `Guardian-App-Starter-Kit`, `eevee`, `oak`, `recon`, `dior`, `las`, MCP servers, Slack bots) read in full — trees, source files, and skills, not just descriptions.
- **Precedent mapping:** every pattern this document relies on is anchored to a named, verified repo (listed inline in §5–§7). Where something does **not** exist, it is called net-new (§10) rather than assumed.
- **Methodology source:** the build process embedded in every scaffold's `AGENTS.md` is the Applied AI team's `Building-a-scaled-app.md` (PRD → prototype + crux → system design → ERD → chunked implementation).
- **Known open items:** why the three finance reconciliation tools bypassed `recon`'s existing Retool UI has not been confirmed with Finance — if that UI is inadequate, the right fix may be improving `recon`'s front-end rather than treating this purely as a discovery failure. Flagged for follow-up rather than asserted.

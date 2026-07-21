# Agent tool & MCP dependencies

What the Storefront agents need to be able to *call* to give the user the best possible assistance. Per review feedback: the agent is only as good as the tools/data it can reach. Split by which agent needs it and what it unlocks. **Anything marked (confirm via Delphi) is a Headout-internal detail to verify before building.**

Legend: ✅ have it / 🔨 build it / 🔌 need access from platform / ❓ confirm exists.

---

## Discovery / Search agent — "does this already exist?"

| Tool | Why the agent needs it | Status |
|---|---|---|
| Catalogue semantic search | Core: find existing tools by capability | ✅ built (pgvector) |
| Catalogue browse (filter by type/team) | "show me all MCPs / what has ops built" | ✅ built |
| Embeddings | Powers search | ✅ local model (or 🔌 gateway embeddings) |

## Critique / scope agent — "should this be built, and in what shape?"

This is where richer tool access most improves the answer. Today it reasons largely from the conversation; each tool below makes its recommendation more grounded.

| Tool | Why the agent needs it | Status |
|---|---|---|
| **Delphi (Headout KB)** | Headout-specific context so it doesn't build on wrong assumptions (how seat maps / bookings / pricing work). Also the source of truth for the questions below. | ✅ wired (`delphiClient.ts` → MCP `https://delphi.headout.com/tools/mcp`; needs `DELPHI_API_KEY`) |
| **Capability check** (`verify_capability`) | Avoid false "Claude/ChatGPT can't do X" claims before recommending a build | ✅ built |
| **Existing-tools lookup** (reuse the catalogue search) | Ground the "feature-request the near-miss instead" recommendation in real tools | ✅ built |
| **Zeps capability + connector list** | To recommend "build a Zep" accurately, the agent must know what Zeps can actually do *today* (which connectors are live, what's still being wired) | ❓ confirm current Zeps capabilities (confirm via Delphi) |
| **Vulcan / Plato capability facts** | So it never routes a user to a tool that can't do the job (Plato = incremental only, no greenfield; Vulcan = comments only) | ✅ captured (per Delphi); keep current |
| **Approved-vendor / data-policy list** | When it suggests a third-party (Apify, RocketReach, etc.), it must only suggest sanctioned ones, and know PII rules | 🔌 need from platform (confirm via Delphi) |
| **Modality→destination map** | Each modality resolves to a real next step (Zep deeplink, Claude skill docs, Claude Code, eng-project pitch) | 🔨 build (partly in `lib/zeps.ts`) |

## Scaffold / build handoff — "how do I start right?"

| Tool | Why the agent needs it | Status |
|---|---|---|
| **GitHub App** (create repo from template, add collaborator) | Create the standards-baked repo | 🔌 need org install (P0 blocker) |
| **Guardian SSO setup skill** | Bake SSO into scaffolded apps (Rohan sharing the skill) | 🔌 get the skill |
| **Zeps builder deeplink** (`buildZepsBuilderUrl`) | Hand a scoped need straight into Zeps | ✅ in `lib/zeps.ts` |
| **Template repo** | The thing repos are generated from | 🔨 build + FE/BE review |
| **BigQuery / Postgres cred provisioning** | Baked into the template so tools get scoped data access | 🔌 need provisioning method |

## Gateway — "is it safe, who can find it?"

| Tool | Why the agent needs it | Status |
|---|---|---|
| **CI / GitHub Actions read** | Read automated check results | 🔨 build (v1) |
| **Vulcan** | AI PR review (comments only, can't gate) | 🔌 v2 — link to PR only for now |
| **Railway deploy** | Ship the tool | 🔌 need org account + deploy method |
| **Catalogue write** (insert listing + embed) | Auto-list on ship (closes the loop) | ✅ built |
| **Slack notify** | Approval DMs, "I'm stuck" pings, review pings | 🔌 need webhook/app |

## Publisher / register

| Tool | Why the agent needs it | Status |
|---|---|---|
| **GitHub repo/README read** | Auto-pull name/description/stack from a pasted repo | ✅ built (public); 🔌 private-repo access |
| **Catalogue write (pending → listed)** | Register + approve flow | ✅ built |

---

## The gaps that most limit assistance quality (priority order)

1. **Delphi MCP access** — ✅ wired in api-server (`delphiClient.ts` + `delphi_*` chat tools). Set `DELPHI_API_KEY` (Slack `/create-delphi-api-key`) in the deploy env to activate. Catalogue stays DB; Delphi is beyond-catalogue only.
2. **Live Zeps capability list** — since Zep is the default recommendation for workflows, recommending it for something Zeps can't do yet is a broken promise. Needs the current-state connector/capability list.
3. **Approved-vendor + data-policy list** — so third-party recommendations are safe and sanctioned.
4. **GitHub App + template + Guardian skill** — the build handoff can't be real without these.

## The real internal tool landscape (per Delphi, Jul 2026)

**`HeadoutAgentsConfig` is a GitHub repo** (config files — shared skills, MCP configs, telemetry) consumed by the coding agents (Claude/Codex/Cursor/Windsurf/Factory). It is *not* a live registry service or a catalogue backend — it's git-managed config. Two implications for Storefront:
- **This is where Storefront's own agents declare their MCP/tool access** — to give the critique agent Delphi, you add Delphi to the relevant agent config in that repo. So wiring the agent's tools = a PR to HeadoutAgentsConfig, not custom plumbing.
- **It's a seed source, not a replacement for our catalogue.** The MCPs/skills configured there are a ready-made list to import into Storefront's catalogue. But Storefront still needs its own catalogue (human-facing descriptions, owners, gap notes, access status) — a config repo isn't a discovery layer.

Live internal tools/MCPs the agent should be aware of — both as things to *call* and things to *surface in the catalogue* when a user's need matches:

| Tool | What it is | Relevance to Storefront |
|---|---|---|
| **Delphi** | Codebase-intelligence MCP; code/doc/Notion search across repos. Connectable to Claude et al. No per-session auth — privilege follows agent backend. | **Wire into the critique agent now — it's production and MCP-ready.** Biggest single assist upgrade. (Watch: ~15min timeout on huge queries, RAG freshness lag — pre-scope the repo.) |
| **Argus** | Incident-intelligence MCP, read-only (incidents, metrics, on-call). API key or Bearer. | Catalogue entry; the agent routes incident-related needs here instead of scoping a build. |
| **Medusa ODE MCPs** | On-demand test-environment mgmt (spin up/down, DB queries, logs). HTTP or CLI. Writes gated. | Relevant to the build/test path; **Plato requires ODE access** — confirms the Plato dependency. |
| **Product OS** | Product/strategy agent — ideation, PRD generation, competitor benchmarking, validation. Connects BigQuery/Mobbin/Notion. `product-os.headout.com`, API key. v0. | **Overlaps our critique/scope agent — strategic question below.** |
| **Hops / Zenith** | Agentic QA test generation / QA agent. | Relevant to the build→review phase (auto-generate tests); catalogue entries. |
| **PlatoBot internal MCPs** | Internal to Plato's orchestration (not user-facing). | Ignore — not ours to call. |

## Two strategic questions this raises (need a decision)

1. **How Storefront uses HeadoutAgentsConfig (now clarified — it's a config repo, not a competing registry).** Storefront is the human-facing discovery + scoping + build-routing layer; HeadoutAgentsConfig is the git-managed agent config. They're complementary. Decisions: (a) import the MCPs/skills listed in that repo as initial catalogue seed; (b) declare Storefront's own agents' tool access (Delphi etc.) *in* that repo via PR. No conflict — Storefront still owns its catalogue.
2. **Product OS overlaps our critique/scope agent.** Product OS does PRD generation, ideation, and validation — much of what our Phase-2 critique agent does. Decide: does Storefront's scope agent hand off to Product OS for deep PRD work, wrap it, or stay deliberately lighter (quick scope → brief, not a full PRD)? Avoid building a second Product OS by accident.

## HeadoutAgentsConfig — concrete format (from the repo)

It's an installable config repo (`install.sh` sets up a chosen agent with selected bundles). Relevant mechanics:

- **MCPs are declared in `.mcp.json`** (and per-tool `.cursor/mcp.json` etc.) as a standard `mcpServers` map (`{type, url}`). Today only `atlassian` is wired at root. **To give Storefront's agents Delphi/Argus/etc., add them here** — that's the "wiring" step, a PR to this repo.
- **Skills are folders in `.claude/skills/*`** (e.g. `commit-ho`, `create-pr-ho`), activated via `skill-rules.json`, curated per role in **`bundles.json`** (common / frontend / backend / meta / misc). ~45 skills already exist.
- **Sub-agents are `.claude/agents/*.md`** (codebase-analyzer, review-agent, feature-interview-agent, …).

**These skills + the MCP list are a ready-made catalogue seed** (they're exactly the `skill`/`mcp` tool types Storefront lists).

## MAJOR reuse finding: `feature-interview-ho` already is the scope interview

There's a production skill `feature-interview-ho` + `feature-interview-agent-ho` (model: opus) that does structured requirements-gathering — adapts depth (greenfield/brownfield/light), handles "build me X without details," outputs a `SPEC-{name}.md`. **This is ~80% of the critique/scope agent we've been building from scratch on Replit.**

The difference — and Storefront's actual distinctive value — is the *front* of the funnel that `feature-interview-ho` doesn't do: **should this be built at all (reuse-check / kill / reshape), and what shape (Zep / skill / MCP / app / eng-project)**. `feature-interview-ho` assumes you're building and goes straight to spec.

**Implication for the real build:** Storefront's scope agent should be a *thin decider/router* — reuse-check → kill-or-reshape → modality choice — that then hands off to the right existing tool (`feature-interview-ho` for the spec, Zeps for no-code, `create-plan-ho`/`implement-plan-ho` for build planning). **Don't reimplement the interview, the spec, or the planning** — those already exist here. The crown-jewel IP is the *decision*, not the interview mechanics. This is the same pattern as the Product OS overlap: Headout already has scoping/spec/plan tools; Storefront routes to them, it doesn't rebuild them.

Other directly-reusable skills: `create-plan-ho`, `implement-plan-ho`, `implement-task-ho`, `research-agent-ho`, `find-skills-ho`, `create-pr-ho`, `harden-pr-ho`, `qa-ho`, `create-jira-tickets-ho`, `grafana-monitoring-ho`.

## Resolved from earlier open questions
- **Delphi access:** ✅ available as an MCP today — wire it in (was "confirm").
- **Internal MCPs beyond Bookings/Catalog:** ✅ Argus, Medusa ODE, Product OS, Hops, Zenith exist — seed them into the catalogue so discovery finds them.

## Still to confirm via Delphi
- Current production capability of **Zeps** — which connectors/triggers are live vs in-progress (so we don't recommend a Zep for something it can't do yet).
- **Approved third-party vendor list + PII data-policy** (governs what the agent may recommend, e.g. Apify/RocketReach).
- Standard **approval workflow** conventions (feeds the gated-approval design).
- The **format of HeadoutAgentsConfig** (what the config files look like) so we can (a) parse it to seed the catalogue and (b) add Storefront's agents' MCP access to it correctly.

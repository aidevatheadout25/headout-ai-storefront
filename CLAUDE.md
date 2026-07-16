# Headout AI Storefront — project context for Claude Code

Read this first. It's the durable brief for every session. Keep it lean; the linked docs hold the depth.

## What Storefront is
The single front door for internal tools at Headout. A **storefront, not an app store** — it does not host or run tools. It answers three questions in one conversation:
1. **Does this already exist?** (discovery — semantic search over a catalogue, with honest "covers X; falls short on Y" gap notes)
2. **Should it be built, and in what shape?** (a PM-style critique agent that pushes back, kills weak ideas, and picks a build modality)
3. **How do I start and ship it safely?** (routes to the right existing Headout tool; a review gate before anything ships)

Deploying a built tool **auto-lists it back into the catalogue** — the loop feeds itself.

The core differentiator is **tool access + Headout context**, not the model. Storefront builds nothing itself; it orchestrates tools Headout already has.

## The three capabilities (from the architecture syncs)
- **Redirect** to an existing app (discovery).
- **Micro-apps via Zeps** — Headout's no-code, agent-based platform (lightweight, no full stack). Default for workflow-shaped automations.
- **Scaffold full internal apps** from standardized, category-based templates (see the scaffolding-taxonomy track — owned by Anish/Rajasekhar, separate workstream).

## Modality model (the reusable IP — the scope agent's job is to pick one and justify it)
`no_build` (Claude-native / one-off) · `zep` (workflow, connectors+triggers, no custom UI — the default) · `skill` (Claude skill, text-in/artifact-out) · `mcp` (agent-callable data/actions, no UI) · `script` (one-off/dev automation) · `micro_app`/`full_app` (only when Zeps genuinely can't — needs custom UI/multi-user) · `eng_project` (too big/critical for self-serve → project pitch, not a repo).

The scope agent is a **thin decide-and-route layer**, not a monolith. It does NOT reimplement requirements-gathering/spec/planning — Headout already has those (`feature-interview-ho` in HeadoutAgentsConfig, `create-plan`/`implement-plan` skills, Product OS). Don't build a second Product OS or feature-interview by accident.

## Ground truth on the internal tool landscape (confirmed via Delphi — do NOT overpromise)
- **Guardian** — Headout SSO standard. A setup skill exists (bake into templates). This is auth; not raw Google OAuth.
- **Delphi** — codebase-intelligence MCP, **available now**, MCP-connectable. Wire into the scope agent for Headout-grounded advice. (~15min timeout on huge queries; pre-scope the repo.)
- **Vulcan** — AI PR-review bot. **Comments only — no API, no machine-readable verdict, cannot gate a merge.** v1 review = human approval + a link to the PR. Programmatic integration is v2.
- **Plato** — autonomous coding via Slack/REST. **Incremental changes on existing repos only (~30% merge rate). NOT a greenfield builder.** Post-ship helper, not a build path for new tools.
- **Zeps** — the no-code agent platform; the default target for workflow automations. Storefront deeplinks into its builder (`lib/zeps.ts` in the prototype). Confirm live connector/capability set before recommending — some connectors are still being wired.
- **HeadoutAgentsConfig** — a GitHub *config repo* (skills, `.mcp.json`, bundles) consumed by coding agents. NOT a competing registry. Use it two ways: (1) seed the catalogue from the skills/MCPs listed there; (2) declare Storefront's own agents' MCP access there via PR.
- Other catalogue-worthy internal tools: **Argus** (incident MCP, read-only), **Medusa ODE** (test-env mgmt; Plato needs ODE access), **Product OS** (product/PRD agent — overlaps the scope agent, define the boundary), **Hops/Zenith** (agentic QA).

## Current state & direction
- A conversational prototype (discover → scope → modality routing → gateway → auto-list) was built on Replit and validated. **Demo passed; going to production.**
- **Production build:** one **Next.js (App Router)** app, **fully on the Vercel AI SDK** (`ai` core + `@ai-sdk/react` `useChat` + `@ai-sdk/anthropic` + **AI Elements** for chat UI), off Replit. Postgres + pgvector via Drizzle. Railway deploy. See `PRODUCTION-BUILD-PROMPT.md`.
- **The agent decision logic (prompts, intent routing, scope/critique flow, modality model, scope contract) is the IP to preserve** across any re-platform. The eval harness (`e2eConversations.ts`) is the regression net — behavior parity is the bar.
- Gating is **process-level, not a hard technical block** — make Storefront easy enough that teams adopt it; access to Headout tools/APIs routes through the platform.

## Working agreements
- Behavior parity over cleverness: if the eval report drifts after a change, that's a bug — fix the transport, not the prompts.
- Assert on stage/routing/payload, never on LLM phrasing. Never add prompt rules whose only purpose is passing a flaky test.
- Measure and fix are separate steps: run the eval, read it, then one scoped fix pass.
- Don't touch the scaffolding taxonomy (categories/subcategories/templates) here — separate workstream (Anish/Rajasekhar).
- User (Anish) prefers direct, first-principles, execution-focused answers; minimal fluff.

## Docs in this repo
- `PRODUCTION-BUILD-PROMPT.md` — the definitive build plan (Next.js + AI SDK, off Replit).
- `PLATFORM-TEAM-REQUIREMENTS.md` — everything needed from the platform team, by priority.
- `AGENT-TOOL-DEPENDENCIES.md` — what tools/MCPs the agents need to call, and how wiring works.
- `RED-TEAM-STARTERS.md` — conversation test inputs across scenarios.
- Prototype code lives in `artifacts/` (Vite storefront + Express api-server + Drizzle `lib/`) — being replaced by the Next.js build. `CLAUDE-CODE-PROMPT-*.md` / `REPLIT-PROMPT-*.md` are historical build prompts.

_Fuller product docs (PRD v2, BUILD-PLAN, JTBDs v3) live in the sibling `storefront/` project folder — copy them in if this repo should be the single source of truth._

# Storefront — what we need from the Platform team

For the from-scratch build. Grouped by system, each with **the ask**, **why**, and **priority** (P0 = blocks the build starting, P1 = blocks a specific phase, P2 = needed before wider rollout). Owner column = who on our side chases it.

---

## 1. GitHub — repo creation & control (the tracking spine)

Every tool built through Storefront lives in a repo the system creates and controls. This is the core mechanism.

- **[P0] A GitHub App (or bot service account) installed on the Headout org**, with repo-admin + contents (rw) + actions (read) permissions. Storefront uses it to create repos from a template, keep admin, and grant the user write access.
- **[P0] Who owns/operates that bot account** and can approve the org install. (This is the single biggest blocker — nothing in the build flow works without it.)
- **[P1] A template/base repo in the org** we can generate from (we build the template; we need the org location + permission to make it a template repo).
- **[P1] Org policy on system-created repos** — naming, visibility (internal/private), who can be added as collaborators.

## 2. Railway — deployment

- **[P0] Railway org account + billing** set up under Headout (not a personal account).
- **[P1] Auto-deployment approach** — can the platform team support CI-triggered / API-driven `railway up`, or is deploy gated through them? Determines how much of the Gateway deploy step we can automate vs. assist.
- **[P1] Service provisioning policy** — how new services get created, resource limits, environment separation (dev/prod).
- **[P2] Monitoring/alerting standard** for deployed tools (Railway alerts, logging) so the Gateway's kill-switch/incident path has something to hook into.

## 3. Auth / SSO

- **[P0] Google Workspace SSO** — OAuth client credentials for the Storefront app, restricted to the Headout domain.
- **[P1] How SSO is provisioned for *scaffolded* apps** — the base template ships with SSO wired; we need the standard way new internal apps authenticate against the workspace so it's baked in, not hand-rolled each time.

## 4. Data access

- **[P1] BigQuery** — how read access is provisioned for internal tools; the scoping/least-privilege policy. Template ships with a BQ client configured read-only by default.
- **[P1] Postgres / databases** — how scoped DB credentials are vended to new apps.
- **[P1] Prod-write policy** — the rule for any tool requesting write access to production data (the Gateway flags these for human review; we need the actual sign-off process).

## 5. Secrets & third-party API keys (the self-serve boundary)

Storefront's principle: users build without bugging the platform team — **except** for credentials. So this is the one thing we route to platform, and it needs to be smooth.

- **[P1] How shared API credentials are stored and vended** — a secrets manager? Per-app env injection via Railway? We need a standard so scaffolded apps get keys without hardcoding.
- **[P1] The list of already-approved third-party vendors** and the request process for new ones (examples that came up in scoping: Apify, RocketReach, and similar — agents will recommend these, so we need to know what's sanctioned).
- **[P1] Data-policy guardrails** — which vendors are OK for PII / customer data (this directly affects what the scoping agent is allowed to recommend).

## 6. LLM access

- **[P1] LLM gateway** — is OpenRouter (or an internal gateway) the standard, and can we get an endpoint + keys? We build behind one provider module so this is a config swap, but we need to know the target. *(Rajasekhar was exploring — confirm status.)*
- **[P1] Rate limits / quotas** for the gateway, and cost ownership.
- **[P2] Embeddings** — whether the gateway exposes an embeddings endpoint, or we run a local model (current prototype uses a local model because the Replit integrations didn't expose embeddings).

## 7. Delphi — Headout knowledge base

- **[P1] Delphi MCP access** — endpoint, auth, and readiness date. The scoping agent queries it for Headout-specific context; until it's live we run a static context file, so the date determines when we swap.

## 8. Security & CI guardrails

The recent audit found 4–5 internal apps with exposed APIs / data-access issues — the Gateway exists to stop that recurring. **Ground-truth (per Delphi):** Vulcan and Plato are narrower than their docs suggest — several assumed capabilities are not shipped. The review step is designed around what's actually real.

**Reality of the review step (v1):**
- **The review gate is explicit human approval in Storefront.** Not Vulcan.
- **Vulcan cannot be integrated in v1** — it has no external API, returns no machine-readable verdict, and cannot block/gate a merge. It only posts GitHub comments automatically (via webhook) on repos matching `platform*`/`absolut*` naming that have a `.vulcanho` config checked in. Storefront can *link to* the PR where Vulcan's comments appear, but cannot trigger it programmatically or read a pass/fail. **Vulcan integration is explicitly v2.**
- So: template CI (below) catches mechanical issues → Vulcan's auto-comments serve as an AI first-pass *on GitHub, independently* → a human reviews and merges. Storefront gates progression on the human approval, and surfaces a link to the PR (with whatever Vulcan commented) rather than parsing Vulcan.

Asks:
- **[P0] The org's security standards / checklist for internal apps** — so the template's CI and pre-commit hooks enforce the real rules up front (this is what actually protects us in v1, since Vulcan can't gate).
- **[P1] The specific failure classes from the recent audit** — we build the template's CI checks (semgrep/etc.) around these (exposed routes, missing auth, open data access).
- **[P1] Who does the human review** for Storefront-shipped tools (the actual gate). *(Yuvraj to assign.)*
- **[P2] Vulcan v2 integration** — if/when Vulcan exposes an API + structured verdict, and whether the template repos can adopt the `platform*`/`absolut*` naming + `.vulcanho` config so Vulcan auto-reviews them. Roadmap, not v1.
- **[P2] Pre-commit / secret-scanning standard** (gitleaks or equivalent) the org already uses, so we match it.

## 8b. Plato — an incremental-change helper (NOT the primary build path)

**Ground-truth (per Delphi):** Plato does incremental changes on *existing* repos — bugfixes, small features, content/config edits, read-only queries — at a **~30% PR merge rate** (205 PRs, 23 repos, Apr 2026). It **cannot build a new tool from scratch** (no greenfield), never auto-merges/deploys (human review always required), and is single-repo/MVP-scope only. It's experimental (`#try-plato`), not broadly rolled out.

So Plato is **not** the "non-engineer builds a whole tool without a terminal" path I'd hoped — it can't do greenfield, and 2 in 3 of its PRs don't merge. It's a *helper for incremental changes on an already-working repo*, not the builder.

- **[P1] Plato REST API** — it exposes `POST /api/v1/tasks` (programmatic trigger exists — good). Confirm the contract so Storefront could, later, offer "ask Plato to make this change" on an *existing* listed tool's repo.
- **[P1] Where Plato fits our flow** — realistically: after a tool exists, Plato handles small follow-up changes/fixes. It is not part of the initial brief→build path for a new tool (that's Zeps for workflows, Claude Code for custom builds).
- **[P2] "Hot repo" onboarding** — the pre-provisioning step for frequent use; relevant only if we lean on Plato heavily later.

## 9. Guidelines / best practices (needed before the template is finalized)

Rohan is gathering these; platform team owns the infra piece.

- **[P0] Frontend guidelines** (Rohan → FE team).
- **[P0] Backend guidelines** (Rohan → BE team).
- **[P0] Platform/infra guidelines for all internal projects** — the standard stack confirmation (we're assuming Next.js + FastAPI + Postgres + Railway; needs platform sign-off), env management, deploy conventions.
- **[P1] Base-template review** — one FE + one BE engineer to review the template before we build on it (people, ~1hr each).

## 10. Zeps — the no-code agent platform (a primary modality)

Zeps (Rajasekhar's platform) is Headout's internal no-code agent builder, and Storefront already deeplinks into it (`lib/zeps.ts`). For most workflow-shaped automations, "build a Zep" is the recommended self-serve path — so this is a first-class integration, not a nice-to-have.

- **[P1] Stable deeplink contract into the Zeps builder** — confirm the prefill URL format (`buildZepsBuilderUrl`) is stable, so the scoping agent can hand a scoped need straight into Zeps.
- **[P1] How finished Zeps get listed back into Storefront** — the catalogue lists `zep`-type tools; confirm how a published Zep surfaces (API, webhook, manual register) so the loop closes.
- **[P1] Zeps readiness / creds status** — from the hackathon writeup, some connectors/creds were still being wired (Blob token, Twilio/WhatsApp, GitHub/Notion writes). Confirm what's production-ready so the agent only recommends Zeps for things it can actually do today.
- **[P2] Connector coverage roadmap** — which connectors Zeps supports (Slack live; GitHub/Notion read; more coming) so modality recommendations match reality.

## 11. Hosting / networking policy

- **[P1] Subdomain / domain provisioning** — who provisions e.g. `storefront.headout.com` and per-tool URLs.
- **[P2] Internal-only access policy** — VPN, IP allowlisting, or SSO-gating as the standard for internal tools.

---

## The true blockers (P0 — chase these first)
1. GitHub App + bot account owner + org install.
2. Railway org account + billing.
3. Google SSO credentials.
4. Security standards doc + named Gateway reviewer.
5. FE / BE / platform guidelines + template review.

Everything else is P1/P2 and slots in as we build the relevant phase.

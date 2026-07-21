# Headout AI Storefront — Jobs to Be Done

Format: *When [situation], I want to [motivation], so I can [outcome].*
**Opportunity = Importance + (Importance − Satisfaction).** Scores are estimates from the 2 Jul meeting + specs — validate before hard prioritization.

This version adds a **Status** column per job: what's actually true in the codebase and `GO-LIVE-PLAN.md`, as of 2026-07-16. The scores/rationale below are unchanged from the original doc — only the Status column and the summary at the top are new.

## The one thing to read before using this for prioritization

**Going live (`GO-LIVE-PLAN.md`) ships the Seeker experience solidly, but does not close the #1-ranked opportunity.** B4 ("guided build for non-engineers in Claude Code," Opp = 17, ranked #1) depends on the GitHub App + standards-baked template repo (B3, Opp = 16) — both are P0 platform-team blockers (`PLATFORM-TEAM-REQUIREMENTS.md` §1, §9), not resolved by shipping the existing prototype off Replit. Going live makes discovery, critique, and publishing real; it does not make the Builder's actual build-handoff real. Don't let "we shipped" read as "B3/B4 are done."

What going live *does* unlock immediately (Phase 1 of `GO-LIVE-PLAN.md`): S1, S4, S5, B1, B2, PB1, PB2 — because the search/browse/critique/publish agent logic already exists in the prototype and just needs a real deploy, real auth, and real seeded data to be true in production rather than on Replit.

What Phase 2 of `GO-LIVE-PLAN.md` (wiring Delphi + the rest of the Headout tool landscape) improves: B5 directly, and the grounding behind B1/B2 indirectly.

What neither phase touches, because it's blocked on the platform asks in `PLATFORM-TEAM-REQUIREMENTS.md` §1/§9, not on this repo's code: **B3, B4, the CI/deploy half of B6, the Slack-notify half of B7, PB3's admin-transfer workflow, PB4.**

---

## Seeker (primary) — non-engineer domain expert; find & reuse

Enters to find/reuse. If a match fits, uses it (maybe shares) and the loop closes. Highest volume.

| ID | Job statement | Category | Imp | Sat | Opp | Pri | Today / why it fails | **Status (2026-07-16)** |
|---|---|---|---|---|---|---|---|---|
| S1 | When I hit a recurring problem, I want to find whether a tool/skill/app already solves it, so I can reuse instead of rebuild | Func | 9 | 3 | 15 | P0 | Slack search + ask around; tribal, no persistent catalogue | **Built.** `search_catalogue` (pgvector semantic search) is live in `chatAgent.ts`. Ships as-is once `GO-LIVE-PLAN.md` Phase 1 lands (real domain + `seed:real` run). |
| S2 | When I describe my problem in my own words, I want to get close matches plus a plain-English note on where each falls short, so I can judge fit without testing each | Func | 9 | 2 | 16 | P0 | Open and try each; slow, no gap visibility | **Partial — a real product gap, not a go-live gap.** Matching works, but `chatAgent.ts:1020-1023`'s actual reply is *"[Tool] already does this — [one-liner]. Does that cover what you need, or is there a gap it doesn't handle?"* — it asks the *user* to spot the gap rather than proactively stating "covers X; falls short on Y" the way `CLAUDE.md`'s own description promises. Worth a deliberate prompt fix, independent of go-live. |
| S3 | When I find a candidate, I want to see its full detail — what it does, owner, trust/flag status, how to get it, so I can adopt with confidence | Func | 7 | 3 | 11 | P1 | DM the owner; friction, owner may have moved on | **Partial.** `get_tool_details` + `ToolDetailOverlay.tsx` exist and the schema has `ownerName`/`ownerSlackId`/`accessLevel`/`visibility`/`status`. But most of the 89 real seed rows (`realSeedData.ts`) have `ownerName`/`ownerSlackId` **deliberately blank** — seeded as unclaimed, per the seed commit message. "Owner" will read empty for most tools until someone runs the claim flow (see PB3). |
| S4 | When I just want to see what exists, I want to browse the catalog by type/team/category without the agent, so I can explore casually | Func | 6 | 2 | 10 | P1 | Nothing persistent exists | **Built.** `browse_catalogue` tool + catalogue UI. Ships as-is in Phase 1. |
| S5 | When I find something useful, I want to share it via one link, so my team adopts it too | Social | 6 | 4 | 8 | P2 | Screenshot/DM; dies in the scroll | **Built.** Tool detail pages have stable, shareable URLs (`ToolDetailOverlay`/`ToolCard`/`App.tsx` routing). Ships as-is. |

## Builder (primary) — the Seeker whose search found no fit

Crosses the fork into the 3-phase agent build. Same human as the Seeker, different jobs.

| ID | Job statement | Category | Imp | Sat | Opp | Pri | Today / why it fails | **Status (2026-07-16)** |
|---|---|---|---|---|---|---|---|---|
| B1 | When nothing fits, I want to have the agent help decide whether this should even be built and shape clear requirements, so I don't build the wrong thing | Func | 8 | 2 | 14 | P0 | Start building blind in Replit/Claude Code | **Built.** The scope/critique agent, modality model, and kill/reshape flow are the core IP already implemented in `chatAgent.ts`. Ships as-is in Phase 1. |
| B2 | When my idea is vague, I want to have the agent push back and critique (do you really need this? better form?), so I can land on the right minimal solution | Func | 8 | 2 | 14 | P0 | No critique loop; over/mis-build | **Built.** Same agent logic as B1 — the "kill weak ideas" critique flow exists and ships as-is. |
| B3 | When the approach is locked, I want to get a fully set-up, standards-baked repo (repo, boilerplate, auth, BQ, security, CI), so I can skip the 60-70% boilerplate and get the foundation right | Func | 9 | 2 | 16 | P0 | Scaffold from scratch | **Not built. Platform-blocked, not go-live-blocked.** Needs a GitHub App/bot account (org install) + a template repo — both P0 asks in `PLATFORM-TEAM-REQUIREMENTS.md` §1/§9 that this repo cannot self-serve. `GO-LIVE-PLAN.md` does not include this work; it's the actual next thing to chase once Phase 1 ships. |
| B4 | When I am not an engineer, I want to get step-by-step guidance to set up my environment and build inside Claude Code, so I can ship without prior eng skills | Func | 9 | 1 | 17 | P0 | Figure it out alone; hit the cliff, abandon | **Not built — the #1-ranked opportunity, and it's the one thing going live does not close.** Directly depends on B3 (the scaffolded repo) existing first. Flag this explicitly in any "we're live" communication. |
| B5 | When I need Headout-specific knowledge (e.g. how seat maps work), I want to get answers from our KB (Delphi), so I don't build on wrong assumptions | Func | 7 | 3 | 11 | P1 | Ask around; slow, inconsistent | **Not wired yet, but unblocked and tracked.** Delphi is confirmed live and MCP-connectable (per `AGENT-TOOL-DEPENDENCIES.md`); wiring it in is a PR to `HeadoutAgentsConfig`'s `.mcp.json`, not custom plumbing here. This is `GO-LIVE-PLAN.md` §3 (Phase 2), explicitly called out as the single highest-leverage upgrade to the critique agent. |
| B6 | When I finish, I want to have Storefront review, deploy, and list it automatically, so my work is live and discoverable with no extra steps | Func | 8 | 2 | 14 | P1 | Manual deploy + manual listing; tool stays invisible | **Partial, and structurally capped at "partial" for now.** Catalogue auto-list on register is ✅ built (`catalogue write`). But "review + deploy" for a *freshly built* tool needs the CI/GitHub Actions read + Railway-deploy wiring (not built) and depends on B3 existing. Also: Vulcan cannot gate a merge (comments only, no API) — v1 review is explicit human approval, and the three-gates approval model is still an open design question (`GO-LIVE-PLAN.md` Phase 3 / `PLATFORM-TEAM-REQUIREMENTS.md` §8). |
| B7 | When I am stuck beyond the agent guidance, I want to get a clear path to human help (my team / eng), so I'm never fully blocked | Func | 6 | 4 | 8 | P2 | None; abandonment | **Partial.** `escalate_to_eng` + `draft_brief` exist in `chatAgent.ts`/`routes/briefs.ts` — the agent can hand off an eng-project pitch. What's missing: the Slack-notify piece ("I'm stuck" pings, approval DMs) is unbuilt (`AGENT-TOOL-DEPENDENCIES.md` — needs a webhook/app). |
| B8 | When I ship a tool, I want to feel like a force multiplier, not a duplicator, so I can build with confidence | Emo | 6 | 3 | 9 | P2 | — | **N/A to the build plan directly** — this is the emotional outcome of B1–B6 actually landing well, not a separate thing to build. |

## Publisher (parallel) — already has things built anywhere

Wants them listed + one link to share with their team; may never seek or build.

| ID | Job statement | Category | Imp | Sat | Opp | Pri | Today / why it fails | **Status (2026-07-16)** |
|---|---|---|---|---|---|---|---|---|
| PB1 | When I have built things (here or elsewhere), I want to list them fast (auto-pull details from GitHub/README), so they're discoverable without heavy manual entry | Func | 8 | 3 | 13 | P0 | DM links; no discoverability | **Built for public repos.** Auto-pull name/description/stack from a pasted GitHub URL works today (`AGENT-TOOL-DEPENDENCIES.md`: "✅ built (public)"). Private-repo access is a separate, unbuilt platform ask (🔌). Ships as-is for public repos in Phase 1. |
| PB2 | When I want my team to use my tools, I want to get one shareable link where they see all details and download/use easily, so I can stop re-sharing individually | Func | 8 | 3 | 13 | P0 | Repeated DMs/screenshots; does not scale | **Built.** Same shareable tool-detail URL as S5. Ships as-is. |
| PB3 | When my tool changes or I move teams, I want to update or transfer ownership easily, so listings stay accurate | Func | 6 | 2 | 10 | P1 | Nothing; entries rot, tools orphan | **Partial.** `POST /api/tools/:id/claim` exists (`routes/tools.ts`) for an unclaimed tool → claimed, one-time manage key. Re-claiming an *already-claimed* tool explicitly requires "an admin" per the route's own error message — but there's no defined admin role/workflow yet, so transfer-on-team-change isn't fully closed. |
| PB4 | When people adopt what I published, I want to get visible usage/attribution, so my impact is seen | Social | 5 | 3 | 7 | P2 | Ad-hoc mentions | **Not built.** No usage analytics or attribution surfacing found in the codebase. Lowest-priority (P2) and lowest-ranked opportunity — fine to leave for later. |

## Top opportunities — where to aim first

| Rank | Job | Opp | Why | Status vs. go-live |
|---|---|---|---|---|
| 1 | B4 — guided build for non-engineers in Claude Code | 17 | The whole bet. If this fails, nothing downstream matters. | **Not touched by going live** — blocked on B3/platform asks. |
| 2 | S2 — semantic match + plain-English gap annotations | 16 | Makes discovery trustworthy. | **Ships, but only partially correct** — the gap-annotation half needs a prompt fix. |
| 2 | B3 — standards-baked repo | 16 | Makes building safe. | **Not touched by going live** — platform-blocked (GitHub App + template). |
| 4 | S1 — "does a solution already exist?" | 15 | The reason people show up. | **Ships as-is.** |
| 5 | B1 / B2 — product critique; B6 — auto review to deploy to list | 14 | Product-lead spine + the closing loop. | **B1/B2 ship as-is; B6 only partially** (auto-list works, review/deploy for new builds doesn't). |

---

## Docs this complements

- `GO-LIVE-PLAN.md` — the execution plan these statuses are checked against.
- `PLATFORM-TEAM-REQUIREMENTS.md` / `AGENT-TOOL-DEPENDENCIES.md` — source for what's platform-blocked vs. buildable here.

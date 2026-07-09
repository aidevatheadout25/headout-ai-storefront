# Consolidated agent fix — get the decision logic right so it ports to the real build

## Framing

The Replit scaffold (frontend, DB wiring) is throwaway. **The agent logic in `chatAgent.ts` — routing, the scope contract, prompts, the modality model — is the reusable IP and will be copied into the from-scratch build.** So the goal here is not "patch the demo," it's "make the decision contract correct and portable." Treat `chatAgent.ts` + the brief/outcome schema as the deliverable.

Evidence base: the E2E eval report (`artifacts/api-server/src/eval/e2e-report.md`). Re-run it after each phase to confirm no regression.

Work in the phase order below. Phases 1–2 are reliability (nothing works without them); 3 is the reusable model; 4 is behavior; 5 is client state; 6 is tests. Do not run the suite locally (no env) — typecheck, commit, I run it in Replit.

---

## Phase 1 — Make the build handoff deterministic (report finding #1)

**Bug:** scenarios 2, 4, 8 got an explicit "I want to build it" and never reached the critique agent — stayed in `chat`. Scenarios 5/6/7/9 did, on identical triggers. The handoff (`buildShaped && hasSearched && found.size === 0`) depends on the concierge *choosing* to call `search_catalogue` on the build turn; when history already shows "no match," the LLM often skips the search, so `hasSearched` stays false and the handoff never fires. Non-deterministic.

**Fix:**
- When `buildShaped` is true (typed build intent or `followsBuildClarifier`) OR the client sends `mode: "scope"`, the entry into the critique agent must not depend on the concierge's tool choice. Force it: if `buildShaped`, deterministically run the catalogue search in code (call `searchCatalogue` directly, not via the LLM), then branch — strong match → return it for reuse; otherwise → `runScopeChat` immediately. The concierge LLM should not be in the loop for deciding whether to hand off.
- The explicit "let's scope it" signal from the fork chip must always carry `mode: "scope"` from the client so it routes straight to `runScopeChat` (line ~765) without re-detection. Verify the chip sends it; the harness sends the trigger as text, so also keep the text path deterministic per the bullet above.

**Acceptance:** all of scenarios 2, 4, 7, 8, 9 reach `stage: "scope"` (then brief/kill/escalate), deterministically, on every run.

## Phase 2 — Kill the concierge dead-end (report finding #2)

**Bug:** when it fails to hand off, the concierge repeats "I'm not the right place to run scoping… take it to the team who can build it… nothing more for me to do here." The product IS where scoping happens. This is the old "scoping specialist" framing leaking again.

**Fix:** remove every "take it to the team / I don't scope / hand off to the right people / nothing more I can do" construction from the concierge `SYSTEM_PROMPT`. The concierge has exactly two moves on a build-shaped no-match: (a) the deterministic handoff from Phase 1 fires (so it never needs to speak), or (b) if it must emit text, it's the one-line "Nothing in the catalogue covers this — let's scope it." It never tells the user to go elsewhere to scope, and never says it can't help with builds.

**Acceptance:** grep the concierge prompt and all its fallback strings — no "team/elsewhere/can't scope" language remains. No transcript contains a "take it to the team" brush-off.

## Phase 3 — The reusable model: modality + outcome + risk (report findings: flattening, eng-team, PII)

This is the portable core. Redesign the scope agent's output contract.

**3a. Modality.** Replace the binary `appClass` (micro|full) with a `modality` field the critique agent must choose and justify:
- `no_build` — Claude-native or one-off (pairs with the kill outcome)
- `zep` — **a Zep on Headout's internal Zeps platform.** Multi-step recurring workflow that orchestrates connectors (Slack/GitHub/Notion/etc.), is triggerable (web/API/Slack/WhatsApp/webhook/cron), no-code, built by chatting, caller-bound sharing, can even run code in a sandbox VM. **This is the default recommendation for most workflow-shaped internal automations** — it's the org's sanctioned no-code substrate and Storefront already deeplinks into the Zeps builder (`lib/zeps.ts`, `buildZepsBuilderUrl`). Next step = deeplink to Zeps prefilled with the need, NOT a scaffold repo.
- `skill` — Claude skill; text-in, artifact-out, reusable playbook, no hosting
- `mcp` — machine-callable server exposing data/actions to agents (no UI, programmatic, high-volume)
- `script` — one-off or dev-side automation
- `micro_app` / `full_app` — a custom-built app. **Only when Zeps genuinely can't do it** — i.e. it needs a rich custom UI beyond chat/config (e.g. a file-upload + results-review dashboard), or a persistent multi-user product surface. If it's just connector orchestration + triggers, it's a Zep, not an app.
- `eng_project` — too large/critical/load-bearing for self-serve (pairs with the escalate outcome)

Add a one-line `modalityReason` the agent fills. Put a decision guide in `buildScopeSystemPrompt`:
- "multi-step workflow, connectors, triggerable, no custom UI needed → **zep** (the default for automations)"
- "text-in artifact-out, same steps repeatedly → skill"
- "agents calling it programmatically, no human, high volume → mcp"
- "one-off fixed dataset → no_build or script"
- "needs a real custom UI / upload + dashboard / multi-user product → micro_app or full_app"
- "load-bearing infra, high criticality → eng_project (escalate)"

**The key judgment to encode:** Zeps is the first thing to consider for any workflow automation, because it's no-code, self-serve, and already the org standard. The agent should only recommend a custom app when it can articulate *why Zeps can't do it*. This directly serves the product's self-serve goal.

**3b. Outcome taxonomy.** Expand from {draft_brief, recommend_kill, end_scope} to add:
- `escalate_to_eng` — a distinct tool call for the `eng_project` case: produces a short **project pitch** (problem, why it's load-bearing, suggested owning teams, rough shape) instead of a self-serve repo. This fixes scenario 8, where the agent correctly said "engineering team territory" but had only draft_brief (→ self-serve repo, a contradiction) or kill available.

**3c. Risk.** Current risk is binary low|high labeled "(customer-facing / financial)" — no bucket for internal-but-sensitive (PII, Legal/Procurement data). Add a dimension or relabel: risk should elevate to high on PII / financial / customer-facing / regulated-data, and the label must not claim "customer-facing" for an internal tool. Scenario 2 (Legal/Procurement contract terms, sign-off required) must come back high.

**3d. Scaffold reflects modality.** The simulated scaffold's "what's inside" is currently a fixed TS/MCP file list for everything. Make it a function of `modality` (a skill shows a skill structure, an MCP shows a server, a zap shows a workflow config, etc.). Still simulated/badged — but honest to the chosen shape.

**Acceptance:** scenarios 2→mcp, 3→skill, 4→zap, 5→no_build, 6→no_build/script, 7→full_app, 8→eng_project (escalate, not brief). Each brief/outcome names the modality with a reason. Scenario 2 risk = high.

## Phase 4 — Critique agent behavior (report finding #3)

**Bug:** scenario 7 asked "where does the candidate data come from?" three times because the user's answers didn't address it, never drafted, ended stuck at 4 questions. It can't handle a non-answer and loops; it also over-asks.

**Fix in `buildScopeSystemPrompt` + the scope loop:**
- **Hard question cap enforced in code, not just prompt.** Track assistant questions in `runScopeChat`; at the cap (max 6), force a terminal tool call (`draft_brief` with best-effort fields, or `recommend_kill`, or `escalate_to_eng`) via `tool_choice`. Never exceed the cap the way the concierge used to over-interview.
- **Handle non-answers.** If the user doesn't answer the asked question, the agent makes a reasonable assumption, states it, and moves on — it must not re-ask the same question more than once. Add this explicitly to the prompt and reinforce with the cap.
- **Never draft an empty brief.** If forced to draft at the cap, populate every field from what was gathered; if a field is genuinely unknown, write a sensible default and mark it — never blank. (This also addresses the empty-brief render seen in the UI.)

**Acceptance:** scenario 7 reaches a `draft_brief` with all fields populated within 6 questions; no question is asked more than twice; no empty-field brief.

## Phase 5 — Client state bugs (seen in the live UI, not the harness — HomeChat.tsx)

The harness runs server-side so it can't catch these; both were seen live and both are demo-killing.

- **5a. Empty brief on `end_scope`.** When a scope session ends via `end_scope` (`stage: "scope_exit"`), the UI rendered an empty Requirements brief card. Ensure `scope_exit` clears `journeyPhase` and `activeBrief` and renders no brief — it's an exit, not a draft. If `end_scope` carried a `forwardQuery`, route it as a new search instead of dead-ending.
- **5b. Cross-conversation state bleed.** A brand-new chat ("seat map QA") showed the HR-sourcing repo/scaffold from a previous conversation. `scaffoldResult` / `activeBrief` / `journeyPhase` are not being fully cleared when switching or starting a conversation. Audit the new-chat and conversation-switch paths — every journey state variable must reset. This is the worst visual bug we've seen; verify by starting a fresh chat mid-journey and confirming zero carryover.

**Acceptance:** starting or switching conversations shows no prior journey artifacts; `scope_exit` shows no brief card.

## Phase 6 — Off-mission + tests

- **6a.** Scenario 12: it wrote a full poem before redirecting. Off-mission creative/general requests should get a one-line warm redirect to the product's job, not compliance. Tighten the concierge prompt.
- **6b.** Re-run the E2E harness; every scenario should hit its expected outcome. Update the harness expectations if the modality/outcome model changed the shape of a correct result. Keep existing eval tests green.

---

## Validation
Typecheck both packages only. Do not run the suite or harness locally (no DB/Anthropic env). Commit per phase (or in a clean sequence) with clear messages so I can pull and run the harness in Replit after each. Report per phase: what changed, files touched, and anything you had to decide. If a phase reveals the fix is bigger than described, stop and summarize rather than improvising a large refactor.

## Out of scope
The real-repo GitHub-App scaffold (still simulated). Don't rebuild the journey cards beyond what Phase 3d/5 require.

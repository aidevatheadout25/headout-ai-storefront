# Fix pass — handoff reliability + critique loop + honest eval measurement

Based on the latest e2e report. The decision logic is good; these are reliability + measurement bugs. Do them in order — D first, because without honest measurement we can't tell if A/B/C worked. Commit per fix. You can run the harness yourself in the Replit env (sync git in Replit, confirm DB + Anthropic env, then run) — but keep measure and fix separate: after D, re-run once and share the baseline before doing A/B/C, so we see the true starting point.

Ground rule: assert on stage/routing/payload, never on LLM phrasing. Do not add prompt rules whose only purpose is passing a test.

## D — Fix the eval harness measurement (do first)

The harness (`e2eConversations.ts`) reports the **last turn's** stage, so a conversation that reached `draft_brief` at turn 5 but had extra scripted turns after shows as "chat." It's undercounting successes.

- Capture, per scenario, the **terminal outcome ever reached** (the first `draft_brief` / `recommend_kill` / `escalate_to_eng` in the conversation) and its **full payload** — not the final turn's stage. Report both "terminal outcome" and "modality from payload" in the summary table.
- The harness sends the scope trigger ("Let's scope the idea — I want to build it") as plain text. The real UI's fork chip sends `mode: "scope"`. **Send `mode: "scope"` on that trigger turn** so the harness measures what the UI actually does. (Keep one scenario that uses the typed path without the flag, so we still test typed-intent detection — label it clearly.)
- Re-run and share this baseline report before A/B/C.

## A — One-shot reuse-check so a near-match can't permanently block the handoff

**Bug:** when first-turn search returns a strong match, the concierge shows it and asks "does this cover it?". When the user rejects it and says "build it," the code re-runs the reuse-check, re-finds the same match, and re-blocks — looping "let's scope it" in chat forever, never handing off (scenarios 4, 6, 8, 9).

**Fix:** the reuse-check is one-shot. Once the user has seen matches and signals scope/build intent past them (explicit `mode: "scope"`, or `isBuildIntent`/`followsBuildClarifier` on a turn *after* matches were already shown), route straight to `runScopeChat` — do **not** re-search and re-gate on a strong match. The strong-match-wins branch applies only to the initial reuse-check, not to every subsequent turn. Carry the rejected matches into `searchContext.nearMisses` so the critique agent can reference them.

**Acceptance:** scenarios 4, 6, 8, 9 reach the critique agent (scope → then brief/kill/escalate), both via `mode: "scope"` and via typed "I want to build it" after seeing a match.

## B — Hard-enforce assume-and-move-on in the critique loop

**Bug:** the critique agent re-asked the same question three times when the user's answer didn't address it (scenario 7). Phase 4's prompt-only rule didn't hold.

**Fix:** track asked questions in `runScopeChat`. If the same question (or same missing field) would be asked twice, instead force the agent to state a reasonable assumption and proceed — enforce in code, not just prompt. Combined with the existing 6-question cap: never ask the same field twice; at the cap, force a terminal tool call (`draft_brief` with `fillBriefDefaults`, `recommend_kill`, or `escalate_to_eng`).

**Acceptance:** scenario 7 reaches a terminal outcome within the cap, with no question asked more than once.

## C — Concierge never drafts briefs; no fallback after a brief

**Bug:** after `draft_brief` fired, later turns fell back to the concierge, which re-emitted the brief as prose text (scenario 2, turns 6–7).

**Fix:** the concierge must never produce a brief (it has no `draft_brief` tool — ensure it can't emit brief-shaped prose either; tighten its prompt to route, not draft). Once a conversation has produced a `draft_brief`, subsequent turns are handled in brief/journey context (brief edits, "create my repo"), not re-routed to the concierge.

**Acceptance:** no transcript shows the concierge emitting a brief; post-`draft_brief` turns don't reset to a concierge search.

## Validation
Typecheck both packages. You may run the harness in the Replit env (sync git in Replit first, confirm env). Sequence: D → re-run → share baseline → A → B → C → re-run → share final report. Measurement and fixes stay separate steps. If any fix turns out bigger than described, stop and flag rather than refactoring broadly.

## Out of scope
Reload-restore of scaffold/review state (known gap, separate), the real-repo GitHub-App scaffold, Vulcan/Plato integration. List anything else you spot; don't fix it.

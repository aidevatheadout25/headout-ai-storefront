# Unify build flow — typed intent → scope, one handoff card (corrected)

**Bug (confirmed by a real transcript):** typing "I am trying to build something new" triggers the legacy concierge scoping interview (outcome/frequency/audience gates → forced `record_recommendation` → six-link handoff card) instead of the Builder journey (critique → brief → scaffold). The handoff card also re-renders after every concierge message, including mid-interview questions.

Root cause: two parallel scoping flows. The critique agent (`runScopeChat` / `buildScopeSystemPrompt` in `chatAgent.ts`) only triggers via the fork chip's explicit `mode: "scope"` flag. Typed build intent falls through to the concierge's own interview.

**Code note:** the critique agent is NOT a separate file — it lives inside `artifacts/api-server/src/lib/chatAgent.ts` (`buildScopeSystemPrompt` ~line 526, `runScopeChat` ~line 671, `SCOPE_TOOLS` line 524). There is no `critiqueAgent.ts`.

Scope discipline: implement exactly the items below. No changes to the Builder journey cards, registration flow, or unrelated UI.

## 1. Detect typed build intent

Add `BUILD_INTENT_PATTERNS` alongside `REGISTRATION_PATTERNS` and an `isBuildIntentMessage(text)` mirroring `isRegistrationIntent`. Patterns: "I want to build", "I'm/I am trying to build", "I am building", "help me build", "I want to create a tool/app", "build something", "scope an idea", etc.

## 2. Route build intent through search-first-then-scope

In `runChat`, before the concierge loop, if the latest user message is build intent:
- Run `searchCatalogue` first (the exists-check is non-negotiable — never skip it).
- Strong matches exist → return them normally (user should reuse before building).
- No strong match → skip the concierge loop, call `runScopeChat` with `searchContext` populated from the query + near-misses, return `stage: "scope"` with a flag the client uses to set `inScopeMode = true`.

## 3. CRITICAL — vague intent must carry conversational state (this is the transcript bug)

Replay the failing case: "I am trying to build something new" (vague, matches patterns) → concierge asks "what are you trying to build?" → user answers "I am building something that helps HR where they put an Excel sheet…" — **this answer does NOT match `BUILD_INTENT_PATTERNS`.** If detection only re-runs the regex, it falls through to the concierge again and the bug survives its own tests.

**Fix:** track conversational state. If the previous assistant turn was the "what are you trying to build?" clarifying question (or the conversation is otherwise established as build-scoping), treat the next user message as the build idea and apply step 2's search-first-then-scope routing **regardless of whether it matches the regex.** Detection must be: `isBuildIntentMessage(text) || priorTurnWasBuildClarifier(history)`.

Add a regression test for exactly this two-turn sequence.

## 4. Kill the forced record_recommendation + the concierge interview

- Remove the forced-`record_recommendation` block in `runChat` (the `if (userTurns >= 3)` block, ~lines 866–897) that force-calls it after 3 turns. The critique agent is now the sole owner of build scoping.
- Update the concierge `SYSTEM_PROMPT`: remove the four-gate interview instructions (~lines 141–185: outcome, frequency, audience, feasibility). Replace with: on no-match for a build-shaped request, hand off to scope mode in one sentence; for non-build requests, point to Slack. The concierge no longer runs multi-turn build interviews.

## 5. Handoff card — pick option (a): the critique agent owns the verdict

After this change, build resolution happens in scope mode via `draft_brief` (→ brief card) or `recommend_kill` (→ kill card). The six-link handoff card (from `record_recommendation`) would otherwise be orphaned. So:
- The critique agent's `recommend_kill` card is the single place build-path links appear — when the verdict is "this is a Zeps workflow, not a full app" or "do it in Claude Code directly", the KillCard surfaces the relevant link(s), with a stated reason.
- Deprecate the standalone six-link handoff card for build flows. If it still renders for any legacy/restored conversation, render it only on the **last** message with `stage === "handoff"` (never mid-thread), with stable option order (recommended first, fixed sequence) and a one-line reason under the recommended option.

## 6. Platform-team restriction (both prompts)

Replace line 185 ("Always mention the platform team on Slack as a resource") and add to the critique prompt: the platform team may be mentioned for **exactly one thing — API keys / credentials / access provisioning.** Never for hosting, infrastructure, architecture, or general build advice. Every other need resolves to a self-serve path (Zeps, Claude skill, Replit, Claude Code, or the scaffold). If an idea is genuinely too large for self-serve, the answer is "this needs an engineering team and a proper project pitch," not "ask the platform team."

## 7. Tests + docs

- `pnpm --filter @workspace/api-server run test` stays green.
- New regression tests: (a) "I want to build a tool that does `<thing not in catalogue>`" → `stage: "scope"` within 2 turns; (b) the two-turn vague-intent sequence from item 3 → reaches scope, not the concierge interview; (c) a scope conversation never returns `stage: "handoff"` mid-interview; (d) an infra-heavy idea (HR sourcing) never mentions "platform team" except in an API-key context.
- Update `replit.md`: build-intent routing (search-first → scope), conversational-state detection for vague intent, single-resolution rule, platform-team constraint.

## Acceptance — replay the transcript

"I am trying to build something new" → "what are you building?" → paste the HR sourcing idea → catalogue searched → nothing fits → **scope mode entered** (pill flips to Scoping) → critique interview → brief card with "Create my repo". No six-link handoff card before resolution. Platform team mentioned only re: API keys, or not at all.

If you find issues outside this scope, list them in your summary — do not fix them.

# Task: unify the build-scoping flow to a single owner

## Context

This app (Headout AI Storefront) is a chat-first internal tool catalogue. When a user has no catalogue match and wants to build something, they should enter the **Builder journey**: a critique agent (`runScopeChat` / `buildScopeSystemPrompt` in `artifacts/api-server/src/lib/chatAgent.ts`) interviews them, then produces either a requirements brief (→ scaffold) or a kill recommendation with a self-serve alternative.

**The problem:** there are two parallel scoping flows and they were never actually unified:

1. **Legacy:** the concierge (`SYSTEM_PROMPT` + the `record_recommendation` / `HANDOFF_TOOL` path in `chatAgent.ts`) runs its own multi-turn "four-gate" interview (outcome / frequency / audience / feasibility) and ends by calling `record_recommendation`, which renders a six-link handoff card.
2. **New:** the critique agent (`runScopeChat`) does the same job better — real pushback, a brief, a kill card.

A previous attempt to remove the legacy flow stalled because existing tests assert the legacy behavior ("build hand-off only appears after scoping exchange", "manual-only via concierge gates"). Rather than delete those tests as testing-removed-behavior, the attempt kept the legacy flow alive AND added the new one — then got stuck patching the concierge system prompt with more and more rules ("do not search at conclusion time", "fire record_recommendation immediately once gates are answered") trying to make an LLM behave deterministically for those tests. That's a losing spiral and it changes live demo behavior with every patch.

## The decision (this is the architecture you're implementing)

**One scoping owner: the critique agent.** The concierge's job shrinks to **search + route**. Specifically:

- The concierge never runs the four-gate interview and never calls `record_recommendation`. Remove the forced-finalization block (`if (userTurns >= 3)` → forced `record_recommendation`, currently ~line 866) and the four-gate interview instructions from `SYSTEM_PROMPT` (~lines 141–185).
- On a no-match that is build-shaped, the concierge hands off to scope mode in one sentence.
- The critique agent (`runScopeChat`) owns ALL scoping outcomes — including "don't build, do X instead" (that's `recommend_kill` with a self-serve alternative). So the concierge does not need a manual/no-build conclusion path; the critique agent covers it.
- Typed build intent routes straight to scope (search-first, then scope) — including the two-turn vague case: "I am trying to build something new" → clarifying question → the follow-up answer must route to scope even though it doesn't match build-intent regex (detect via conversational state: prior assistant turn was the build-clarifier question).
- Platform team may be mentioned in either prompt for **exactly one thing: API keys / credentials / access provisioning.** Never hosting, infra, architecture, or general build advice. Every other need resolves to a self-serve path (Zeps, Claude skill, Replit, Claude Code, the scaffold). Genuinely too-big ideas → "this needs an engineering team and a project pitch," not "ask the platform team."
- Handoff card: build-path links now live only on the critique agent's `recommend_kill` KillCard (with a stated reason). The standalone six-link handoff card is deprecated for build flows; if it renders at all for legacy/restored conversations, render it only on the last message with `stage === "handoff"`, stable order, one-line reason.

## On the tests (important — don't repeat the spiral)

The failing tests that assert the legacy concierge gate-interview → `record_recommendation` → handoff behavior are testing behavior this task **removes**. Do not patch the system prompt to make those tests pass. Instead: delete them, or rewrite them to assert the new routing (build intent → `stage: "scope"`; a build conversation never returns `stage: "handoff"` mid-interview).

Do not add system-prompt rules whose only purpose is to force LLM determinism for a test. If a test needs an LLM to behave deterministically, either assert on the routing/stage (deterministic code) rather than the LLM's phrasing, or mark it clearly as a non-deterministic eval, separate from the CI gate.

## Steps

1. **First, verify actual on-disk state** — the git history is muddy; read `chatAgent.ts`, `chat.ts`, `HomeChat.tsx`, and the test suite to see what's really present before changing anything. Report what you find (is the forced block still there? do build-intent patterns exist? which tests assert legacy behavior?).
2. Implement the decision above.
3. Client wiring — confirm/add: when a live `runChat` response returns `stage: "scope"` (server auto-entered scope from typed intent, not the fork chip), `HomeChat.tsx` sets `inScopeMode = true` so the *next* message is sent with `mode: "scope"`. Mirror the conversation-restore logic. Without this, scope mode is only one message deep.
4. Regression tests (deterministic, asserting stage/routing not LLM phrasing):
   - (a) "I want to build a tool that does <X not in catalogue>" → `stage: "scope"` within 2 turns.
   - (b) Two-turn vague sequence → reaches scope, not the concierge interview, not `handoff`.
   - (c) A scope conversation, extended by a third user turn, is still handled by the critique agent (proves scope mode persists — this is the client-wiring check at the API level).
   - (d) An infra-heavy idea (HR sourcing pipeline) mentions "platform team" only in an API-key context, or not at all.
   - Delete or rewrite the legacy gate-interview/handoff tests per the section above.
5. `pnpm --filter @workspace/api-server run test` green. Update `replit.md`: one scoping owner (critique agent), concierge = search + route, platform-team constraint, deprecated handoff card.

## Acceptance — replay the real transcript that exposed this

"I am trying to build something new" → "what are you building?" → paste an HR candidate-sourcing idea (Excel upload → Apify LinkedIn scrape → RocketReach emails → Google Sheet) → catalogue searched → nothing fits → **scope mode entered** (pill flips to Scoping), critique interview begins → brief card with "Create my repo". Send a further message after entering scope → still the critique agent. No six-link handoff card before resolution. Platform team mentioned only re: API keys, or not at all.

## Out of scope

Builder journey cards (brief/scaffold/checklist/review) themselves, registration flow, and anything cosmetic. If you spot issues outside this, list them — don't fix them.

# Fix: the concierge runs the scoping interview before handing off (it shouldn't)

## Symptom (real transcript, current code — 8f7e00c)

User typed a build idea (HR candidate-sourcing pipeline). What should happen: catalogue search runs, then the **critique agent** (`runScopeChat`) takes over and does the scoping. What actually happened:

- The **concierge** ran the entire scoping interview itself — 7 questions, gate-by-gate (who uses it, how often, what's in the sheet, what happens after, who sends, internal/external). Interrogation-style, not sharp PM pushback.
- It then emitted its own internal framing as user-facing text: *"the system will route you to a scoping specialist who'll walk you through the checklist."*
- Only after all that did the handoff fire — the critique agent drafted the brief, the brief card rendered, and the flow continued to scaffold (so the back half works).

So the flow completes, but the concierge is doing the critique agent's job first, and its internal "specialist / route you" language leaks to the user. The interview happens in the wrong place and reads badly.

## Step 0 — confirm the actual trigger before changing anything

I'm not certain which condition let the concierge run the interview instead of handing off immediately. **Diagnose first, then fix.** Read `runChat` in `artifacts/api-server/src/lib/chatAgent.ts` and trace, for a build-shaped ask that surfaces a near-miss (not zero results):

- The build-shaped handoff currently lives at ~line 1043: `if (buildShaped && turn === 0 && found.size === 0)`. Determine whether `found.size === 0` and/or `turn === 0` prevented the handoff from firing on the turn the user described their idea — forcing the concierge to keep the conversation and interview.
- Confirm whether the concierge is emitting the "scoping specialist" line (it's in the concierge `SYSTEM_PROMPT`, not `buildScopeSystemPrompt`).

Report what you find before implementing. The fix below is the intended end state; adjust the mechanism to whatever the trace shows is actually blocking the early handoff.

## Intended behavior

A build-shaped ask hands off to the critique agent **as early as possible** — right after the catalogue search — so the concierge never conducts a scoping interview. The concierge's only role for build asks: run the search, and if there's no strong (reuse-worthy) match, hand off silently. Near-misses travel *with* the handoff so the critique agent can open by referencing them.

## The fix

1. **Hand off on "no strong match," not "zero results."** A near-miss (a related tool below the reuse threshold) must not keep the concierge in control. After search on a build-shaped ask:
   - One or more **strong** matches (at/above the catalogue's existing relevance threshold — find it in `catalogue.ts`, don't invent a number) → return them; reuse-check wins, no handoff.
   - Otherwise (no matches or only near-misses) → hand off to `runScopeChat`, passing all surfaced tools as `searchContext.nearMisses`.
2. **Remove the `turn === 0` constraint** on the handoff — it must fire whenever a build-shaped ask has searched and has no strong match, regardless of turn index. Once handed off, `runScopeChat` owns the conversation.
3. **The concierge must never interview.** With the handoff firing early it shouldn't get the chance — but keep its existing "you do not scope, you never ask about outcome/frequency/audience/feasibility" instruction as a guard. Do NOT add more prompt rules to force this; the routing fix is what prevents it.

## Fix: stop leaking internal framing to the user

The concierge prompt refers to the critique agent as "a separate scoping specialist the system routes to." That surfaced verbatim to the user as a confusing dead-end summary. From the user's side it's one continuous assistant — they should never hear "scoping specialist," "the system will route you," or any handoff narration. Reword the concierge's no-match acknowledgement to a plain one-liner ("Nothing in the catalogue covers this — let's scope it properly.") with no routing/specialist language. The handoff is silent: the critique agent's first question is the next thing the user sees.

## Tone (secondary, only if clearly loose)

Once the critique agent owns the interview, confirm `buildScopeSystemPrompt` front-loads a sharp challenge (kill / reshape / feature-request the near-miss) and caps at ~6 questions — not gate-by-gate requirements gathering. Only tighten wording if loose; don't restructure.

## Tests (deterministic — assert stage/routing, never LLM phrasing)

- **The missing regression, and the exact transcript case:** build-shaped ask where search returns a **near-miss** (below strong threshold) → routes to `stage: "scope"` with non-empty `searchContext.nearMisses`, and the concierge does **not** ask a scoping question first.
- Build-shaped ask with a **strong** match → returns the match, no handoff.
- Build-shaped ask, zero results → routes to `stage: "scope"` (preserve existing behavior).
- No assertion depends on concierge or critique wording.

## Validation — do NOT run the test suite here

The suite needs the Replit DB + Anthropic keys, which don't exist in this environment; running it fails on missing env and tells you nothing. Typecheck both packages — that's the only local gate. Write the tests but do not execute them. Do not change anything to make local tests pass. Commit, and I'll run the suite in Replit. Report: your Step 0 findings, the diff, the threshold value/source used, and any file touched.

## Acceptance — replay the transcript

Type the HR sourcing idea → search surfaces the near-miss → the **critique agent takes over immediately** (the concierge asks no scoping questions) → it opens with a challenge referencing the near-miss → short, sharp interview → brief card with "Create my repo." The words "scoping specialist" and "the system will route you" never appear.

## Out of scope

Builder journey cards, registration, the separately-tracked real-repo scaffold. List anything else you spot; don't fix it.

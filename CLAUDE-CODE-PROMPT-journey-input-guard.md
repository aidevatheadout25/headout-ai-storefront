# Fix: typed input mid-build-journey falls through to the concierge and denies the product's core capability

## Symptom (real transcript)

A user in the middle of the Builder journey (repo scaffolded, at the review/publish step) typed: *"pull the latest code review and let me know if it's good to publish."* The agent replied: *"That's outside what I can do here — I don't have access to code repositories or the ability to review code. I can only help you discover, register, and manage tools… for code review reach out to your team directly."*

That is exactly backwards — reviewing and publishing a built tool is the Gateway phase, the product's core value. The agent denied the thing the product exists to do.

## Root cause

In `artifacts/storefront/src/components/HomeChat.tsx`, `submitText` (~line 369) only branches on `addMode` and `inScopeMode`. There is no guard for an active `journeyPhase` (`scaffold` / `checklist` / `review`). After the brief is confirmed `inScopeMode` is cleared, so any text typed during the build phases routes to `runChat` (the concierge), which has no build context and returns its generic capability disclaimer.

The journey only advances via buttons/cards (Create my repo, verify step, Submit for review). Typed input during the journey is unhandled.

## The fix

Add a journey-aware branch to `submitText`, checked **before** the concierge fallback: when `journeyPhase` is active (`scaffold`, `checklist`, or `review`), do not route to `runChat`. Instead handle the message in journey context:

1. **If the message expresses a journey action** — publish / ship / go live / review / "is it ready" / submit → trigger the corresponding journey step programmatically (the same handler the "Submit for review" button calls), or if they're not yet at that step, point them to the next action ("Finish the checklist below first, then I'll run the review — that's the safety check before it goes live").
2. **If it's a question about the build** (what's in the repo, what happens next, what does review check) → answer from journey context in one or two sentences, referencing the actual phase. Never claim the product can't review or publish — that IS the Gateway phase.
3. **If it's clearly off-journey** (a new search, "register a different tool") → offer a short disambiguation with a chip to leave the journey, mirroring the add-mode disambiguation pattern already in the file. Don't silently drop them into the concierge.

Keep it small and localized to `submitText` + a helper. Do not restructure the journey cards or the concierge.

## The durable point (note, don't necessarily build now)

This is the fourth instance of the same class: one input, multiple UI modes (search / scope / add / journey), and every mode boundary leaks typed input to the wrong handler. The demo-safe fix is the guard above. The real fix for the production build is a single state-aware input router keyed on current mode, so this class of bug can't recur. Flag this in your summary as a recommended refactor for the from-scratch build; don't attempt it here.

## Validation — do NOT run the test suite here

Needs the Replit DB/Anthropic env; running locally fails on missing env and tells you nothing. Typecheck both packages — that's the only local gate. Add a regression test asserting that with `journeyPhase` active, a "publish"-intent message does not produce a concierge capability-disclaimer response (assert on the routing/handler, not LLM phrasing). Write it, don't run it. Commit; I'll run the suite in Replit.

## Acceptance — replay the transcript

Scaffold a build → at the review step, type "is it good to publish?" → the agent responds in journey context (triggers/points to the review step), never "I can't review code / reach out to your team." Typing "publish it" advances to the review→live flow.

## Out of scope

Journey cards themselves, the concierge's own behavior outside the journey, registration. List anything else you spot; don't fix it.

# Demo hardening — five P0 fixes, nothing else

This is the last change round before the demo goes to reviewers. Scope discipline matters more than usual: implement exactly these five items. No refactoring, no polish, no drive-by improvements — every extra change is regression risk we can't retest.

## 1. Idempotency guards on the builder journey

**Bug:** `POST /api/builds/:buildId/submit-review` never checks whether the build already produced a tool — a double-click (or slow response + impatient retry) inserts the same tool into the catalogue twice. Same class of bug on "Create my repo" if it can fire twice.

**Fix:**
- In `submit-review`: if `build.toolId` is already set, return the existing result (`{events: [], toolId, toolName, toolSlug}`) without re-running the sequence or inserting again.
- In `POST /api/scaffold`: if a `builds` row already exists for this `briefId`, return it instead of creating a second.
- Frontend: disable "Create my repo" and "Submit for review" buttons while their request is in flight (spinner state), re-enable on error.

**Acceptance:** double-click both buttons rapidly → exactly one build row, exactly one catalogue entry.

## 2. Journey restore on reload

**Bug:** `scaffoldResult` and `reviewResult` are component state only. Reloading mid-checklist or mid-review collapses the UI back to the brief card, and re-clicking "Create my repo" creates a duplicate build. Everything needed to restore already lives in the `builds` row (`repoUrl`, `checklistState`, `reviewState`, `toolId`).

**Fix:** when restoring a conversation whose journey reached scaffold or later, fetch the build for the active brief (add `GET /api/briefs/:id/build` or include it in conversation restore) and rehydrate: `journeyPhase`, `scaffoldResult` (from `repoUrl` + the fixed contents list), checklist progress (from `checklistState`), and completed review/ceremony state (from `toolId` — if set, show the ceremony with the real tool link, not the review animation again).

**Acceptance:** reload mid-checklist → checklist reappears with verified steps intact. Reload after ship → ceremony card with the tool link, no way to re-trigger review.

## 3. Preload the embedding model at server boot

**Bug:** the local embedding model downloads/loads on the first search after a cold start — the first reviewer's first query hangs. That reviewer is judging the product on exactly that moment.

**Fix:** trigger the embedding pipeline once during api-server startup (embed a throwaway string, fire-and-forget, log when ready). Don't block the server from accepting requests; the goal is that the model is warm before a human arrives.

**Acceptance:** cold-start the app, wait for the ready log, first real search responds in normal time.

## 4. Demo lock on the seeded catalogue

**Bug:** any visitor can claim a seeded tool and edit its fields — edits re-embed, so one reviewer's vandalism poisons search for everyone reviewing after them.

**Fix:** add an env flag `DEMO_LOCK=1`. When set: `POST /api/tools/:id/claim` and `PATCH /api/tools/:id` return 403 with a friendly message ("Editing is disabled during the review period") for tools with `source` = the seeded value. Tools created during the session (registered or built) stay editable. When the flag is unset, behavior is exactly as today.

**Acceptance:** with `DEMO_LOCK=1`, claiming/editing a seeded tool returns the friendly 403 and the UI shows the message; registering a new tool and editing it still works; with the flag off, everything behaves as before.

## 5. Exact-name search short-circuit

**Bug:** pure embedding search can fumble exact-name lookups ("open ExpTracker") that keyword search would trivially hit — the most embarrassing possible search failure.

**Fix:** in the catalogue search path, before (or alongside) the vector query, run a case-insensitive name match (`ILIKE '%query%'` against `name`, and against name with spaces/hyphens normalized). Exact/name matches rank above vector results. Keep it inside the existing search function so the chat agent needs no changes.

**Acceptance:** searching the exact name of any seeded tool (and lowercase, and with a typo-free partial like "exptracker") returns that tool first, every time.

## Housekeeping

- All existing tests stay green (`pnpm --filter @workspace/api-server run test`).
- Add regression tests for 1 (double submit → one tool) and 5 (exact-name lookup returns the tool first).
- Update `replit.md`: note the boot-time model preload, `DEMO_LOCK`, and the journey-restore behavior.
- Reminder: nothing outside these five items. If you spot other issues, list them in your summary — do not fix them.

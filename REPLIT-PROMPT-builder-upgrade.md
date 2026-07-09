# Upgrade: add the Builder journey (real critique + simulated build loop)

Read `replit.md` first. This upgrade extends the existing chat-first storefront — it does not redesign it. Reuse the existing stack, styles, and patterns everywhere: `anthropicClient.ts` for LLM calls (model `claude-sonnet-4-6`), local embeddings via `lib/embeddings.ts`, Drizzle + pgvector, the existing chat loop in `artifacts/api-server/src/lib/chatAgent.ts`, and the card rendering in `HomeChat.tsx`.

## Why

Today, when the concierge finds no match it hands the user a Zeps link or a Slack link — a dead end. The product's core loop is: **search fails → agent critiques the idea → requirements brief → scaffolded repo → guided build → review → deploy → the new tool lands back in the catalog where the next search finds it.** This upgrade builds that loop: the *conversation* parts real (LLM), the *infrastructure* parts simulated and clearly badged.

## The REAL / SIMULATED rule

Real: everything conversational (critique agent, brief generation) and everything catalog (the shipped tool is genuinely inserted, embedded, and searchable). Simulated: GitHub repo creation, build checklist verification, review checks, deploy. **Every simulated card shows a small gray `SIMULATED` badge.** No badge on real elements. Stakeholders must always know which is which.

## What to build

### 1. The fork (modify `chatAgent.ts` + `HomeChat.tsx`)

When search returns no adequate match (this detection already exists), keep the Zeps/Slack options but add a primary option: **"Nothing fits — let's scope it."** Choosing it enters critique mode *in the same conversation*, carrying the failed search context (query + near-misses + their gaps) forward. The user must never re-explain their problem.

### 2. Critique agent (new mode inside the chat loop — REAL)

A multi-turn scoping conversation. System-prompt behavior contract:

- Open by challenging, grounded in the search result: "X covers ~70% of this — is the gap worth a new tool, or a feature request to its owner?"
- Max 6 questions, one at a time. Concede after the user pushes back twice with reasons.
- Job is to kill or reshape weak ideas, not transcribe: one-off task → recommend using Claude/Zeps directly, no build; near-miss exists → draft a feature request message to the owner; genuinely good idea → say so in one line and draft the brief immediately.
- Ends with exactly one of two tool calls:
  - `draft_brief` — `{problem (1 sentence), users, frequency, must_do (≤5), wont_do (≥3), app_class: 'micro'|'full', risk: 'low'|'high'}`
  - `recommend_kill` — `{reason, alternative}` (both required; alternative rendered as an actionable card, e.g. the drafted feature request)
- PII / payments / auth-decision ideas → `risk: 'high'`, and the agent says what that means (mandatory human review before deploy).

Frontend: render the brief as an **editable card** (inputs, not chat text) with one primary button, "Create my repo". Store briefs in a new `briefs` table (Drizzle, in `lib/db`), including the `search_context` jsonb.

### 3. Scaffold + guided build (SIMULATED, badged)

"Create my repo" → `POST /api/scaffold` → after ~1.5s returns a repo-ready card: fake org repo URL slugified from the brief, plus a plain-English "what's inside" list (login ✓ database ✓ security checks ✓ deploy config ✓ BRIEF.md ✓). Then a **guided checklist** card: 4 steps (install → clone → env keys → open in Claude Code), each with an "I did this — verify" button (fake 1s verification, step n+1 stays locked until n passes) and an "I'm stuck" button (simulated Slack ping confirmation). Persist checklist state in a `builds` table so a page reload resumes where the user left off.

### 4. Gateway review (SIMULATED, badged) → auto-list (REAL)

"Submit for review" → animated check sequence (CI green → no secrets in history → auth intact → security rules), each ~0.7s, then "human review — approved", then "deploy + smoke check — live". All canned. **Then the real part: insert the tool into the `tools` table** (name/description from the brief, `source: 'built'`), generate its embedding through the existing pipeline, and land the user on a ceremony card: the tool's real detail page link + share link + "try searching for it". A subsequent chat search must find it through the normal semantic path — this is the demo's money shot; do not fake it.

### 5. Mode indicator + journey launcher (frontend)

- A small mode pill in the header tracking state: `Searching / Scoping / Building / In review / Live / Registering`.
- On the empty home chat, launcher chips: "Find a tool", "Build something new (guided)", "Register a tool I built" (wires to the existing + Add a tool flow), "Browse the catalogue". At the natural end of each journey, offer chips to walk another — same conversation, no reset.

### 6. Off-script input never dead-ends

If the user types something that doesn't fit the current mode (e.g. a question while the add-tool flow expects a URL), don't force-parse it — respond with a one-line disambiguation and chips: search for it / keep going / browse. Test case that must pass: typing "i want to see the mcp registry" mid-registration routes to browse, not to a garbage inferred tool.

## Housekeeping

- Update `replit.md`: the "read-only browse, no submit/build" architecture decision changes — document the new Builder flow, the briefs/builds tables, and the REAL/SIMULATED boundary.
- Keep the existing retrieval-quality tests green; add one regression: a tool shipped through the Builder flow is findable by semantic search.
- Cap critique sessions at 12 turns; temperature 0 for anything structured; malformed LLM JSON → retry once, then a badged simulated fallback — never a raw error in chat.

## Acceptance walkthrough (do this end-to-end before finishing)

1. Search something the catalog covers → matches with honest gap notes (existing behavior intact).
2. Search something it doesn't → fork offer → critique pushes back → concede-after-two-pushbacks works → editable brief → repo card (badged) → checklist verifies step-by-step, resumes after reload → review animation (badged) → ceremony with a real `/tools/:id` link.
3. Search for the tool you just shipped → it comes back through real semantic search.
4. In critique, describe a one-off task → kill recommendation with an actionable alternative, no brief.
5. The manager test: free text that doesn't match the current mode → disambiguation chips, never a wrong next step.

# Production build — one Next.js app, fully on the Vercel AI SDK, off Replit

This is the definitive build prompt. Goal: take the validated prototype to production as a single Next.js (App Router) application built entirely on the Vercel AI SDK stack — `ai` (server core) + `@ai-sdk/react` (`useChat`) + `@ai-sdk/anthropic` + **AI Elements** (chat UI) — with no Replit or Vite/Express remnants. One unified Next.js app replaces the current Vite storefront + Express api-server split.

**Terminology (so "everything on the AI SDK" is unambiguous):** the AI SDK is not a UI framework. AI Elements (Vercel's shadcn-based chat components) provides the standardized UI (message list, prompt input, copy/regenerate/actions, streaming); `@ai-sdk/react` provides the client data layer (`useChat`); `ai` core runs the agent server-side. The whole stack together is the target.

Work in the existing repo. Commit per phase, typecheck each package, and re-run the eval harness after Phases 4 and 5 — behavior parity is the acceptance bar.

---

## Port over UNCHANGED — this is the IP, do not redesign it
- **Agent decision logic:** every system prompt, intent routing (search / scope / register / browse), the scope/critique flow, the modality model, the scope contract, risk model, and all tools: `search_catalogue`, `browse_catalogue`, `verify_capability`, `start_registration`, `draft_brief`, `recommend_kill`, `end_scope`, `escalate_to_eng`. Preserve the deterministic paths: build-shaped search-first handoff, registration force-tool on first turn, scope-mode routing, the code-enforced question cap, and "never an empty brief."
- **Data layer:** the Drizzle schema + pgvector catalogue, `catalogue.ts` search, embeddings, seed data — bring across as-is.
- **The eval harness** (`e2eConversations.ts` + eval tests) — this is the regression net that proves the rebuild changed nothing about behavior.

## Target architecture
- **Single Next.js App Router app.** Route Handlers (`app/api/*/route.ts`) replace the Express routes (chat, tools, briefs, conversations, register).
- **Server:** `ai` core — `streamText`/`generateText` with zod-typed tools and multi-step (`stopWhen`/`maxSteps`) replaces the hand-rolled Anthropic `tool_use`/`tool_result` loop in `chatAgent.ts`. Provider `@ai-sdk/anthropic` with `baseURL` overridable for an LLM gateway (OpenRouter/internal) later — a config swap, not a rewrite.
- **Client:** `useChat` + AI Elements components for the chat surface. The app's custom rendering — tool cards, brief card, escalate card, kill card, mode pill, journey phases, disambiguation chips — renders on top of AI Elements' message/stream state (from tool-invocation / data parts). Lose no existing UI behavior.
- **DB:** Postgres + pgvector via Drizzle (unchanged). One database.
- **Auth:** env-configurable OIDC seam (`AUTH_ISSUER_URL`) so **Guardian** slots in when the setup skill lands (Rohan sharing); a dev-auth stub behind a flag for local. No provider hardwired.
- **Env:** standard `ANTHROPIC_API_KEY` / `DATABASE_URL` (+ optional gateway vars). Remove all `AI_INTEGRATIONS_ANTHROPIC_*` Replit integration vars.

## Phases

### Phase 1 — Scaffold the Next.js app
Create the App Router app (TypeScript). Carry in the Headout design system (Halyard fonts + tokens from the existing `design-system/colors_and_type.css`). Add `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`, AI Elements. Wire Drizzle + pgvector connection.

**Decide and report:** get the AI Elements UI by (a) assembling a fresh Next app + AI Elements ourselves (recommended — no template baggage, we own auth/DB), or (b) forking Vercel's AI Chatbot template and stripping it (its Auth.js + own DB schema fight our Guardian + Drizzle catalogue). Recommend (a); use the template only as reference. Flag if you disagree after looking.

### Phase 2 — Port the data layer
Move the Drizzle schema, `catalogue.ts` search, embeddings, and seed into the Next app's `lib/`. Confirm semantic search works against a seeded DB.

### Phase 3 — Auth seam
Env-driven OIDC (`AUTH_ISSUER_URL`), Guardian-ready, with a local dev stub behind a flag. Remove `@workspace/replit-auth-web` and the hardcoded `ISSUER_URL = https://replit.com/oidc`.

### Phase 4 — Port the agent onto AI SDK core
Rewrite `chatAgent.ts` as AI SDK `streamText` with tools + multi-step, preserving every prompt, tool, cap, and deterministic route (implement forced tool choices with `toolChoice`/`activeTools`, and the deterministic search-first handoff in code — not the model's whim). Replace `@workspace/integrations-anthropic-ai` / `anthropicClient.ts` (raw `@anthropic-ai/sdk`) with the AI SDK provider. Expose as `app/api/chat/route.ts` streaming to the client. **Re-run the eval harness — the report must match pre-rebuild behavior. Any drift is a port bug; fix the port, not the prompts.**

### Phase 5 — Build the chat UI
AI Elements + `useChat` shell with the standardized interactions people asked for: **persistent new-chat (no scroll-to-top), copy-message + copy-conversation, natural autoscroll + scroll-to-bottom, sticky streaming input.** Render all custom cards / mode pill / journey phases / disambiguation chips on top. **Verify the full journeys by hand:** search → no-fit fork → scope → modality → editable brief; register (paste URL → prefilled card); browse. Re-run the eval harness.

### Phase 6 — Delete the old stack + docs
Remove: the Vite storefront, Express api-server, `mockup-sandbox`, `@replit/vite-plugin-*`, `.replit`, `.replitignore`, and the accumulated `REPLIT-PROMPT-*.md`. Convert `replit.md` → `README.md` (local dev, build, Railway deploy; no Replit).

## Guardrails
- **Behavior parity is the bar.** The eval report after Phase 4 and Phase 5 must be behaviorally identical to before. Drift = bug.
- **Don't touch the scaffolding taxonomy** (categories / subcategories / templates) — another team member owns that track.
- If Phase 4 (agent → AI SDK core) is bigger than it looks, stop and summarize before continuing.
- Where the app must run (evals, dev), it needs `DATABASE_URL` + `ANTHROPIC_API_KEY` in the environment — confirm they're present before running; don't report false failures against a missing env.

## Acceptance
One Next.js app, no Replit and no Vite/Express remnants; LLM via AI SDK core; chat UI via AI Elements + `useChat` (streaming, copy, persistent new-chat, clean scroll); Guardian-ready auth seam; Drizzle/pgvector data layer intact; all three journeys work by hand; and an eval report behaviorally identical to before the rebuild.

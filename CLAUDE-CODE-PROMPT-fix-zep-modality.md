# Fix: the build modality is `zep`, not `zap`

The consolidated fix used `zap` (a generic Zapier-style "no-code scheduled workflow, no custom logic"). That's wrong. It should be **`zep`** — a Zep on **Headout's internal Zeps platform** (Rajasekhar's tool). This is not a cosmetic rename; the meaning, scope, and routing all change. Surgical fix, no other behavior changes.

## Context: what Zeps actually is
Zeps is Headout's no-code conversational agent platform. A "Zep" is a multi-step workflow agent the user builds by chatting — it self-configures connectors (Slack/GitHub/Notion/etc.), skills, and triggers (web/API/Slack/WhatsApp/webhook/cron), runs as a process or sandbox VM, and uses caller-bound credentials (acts as whoever runs it). It is far more than a scheduled push — it's the org's sanctioned self-serve substrate for workflow automations. Storefront **already deeplinks into the Zeps builder** via `lib/zeps.ts` (`buildZepsBuilderUrl`) and already lists finished Zeps as the `zep` catalogue tool type.

## Changes

1. **Rename the modality value `zap` → `zep`** everywhere in `chatAgent.ts` (the `Modality` type, the `draft_brief` enum, `VALID_BRIEF_MODALITIES`, decision-guide text) and in `e2eConversations.ts` scenario expectations. This also aligns the build modality with the existing `zep` catalogue tool type (currently the type is `zep` but the modality was `zap` — inconsistent).

2. **Redefine it.** Replace the "no-code scheduled/triggered workflow, no custom logic, no interaction" description with: *"a Zep on Headout's Zeps platform — a no-code multi-step workflow agent that orchestrates connectors and runs on triggers (Slack/cron/webhook/etc.), built by chatting, no code, self-serve."*

3. **Make it the default for workflow-shaped automations.** Update the decision guide in `buildScopeSystemPrompt`: a Zep is the FIRST thing to consider for any workflow/automation need (connectors + triggers, no bespoke UI). The agent should only pick `micro_app`/`full_app` when it can articulate *why Zeps can't do it* — i.e. it needs a rich custom UI (file-upload + results dashboard) or a persistent multi-user product surface. Pure connector-orchestration + triggers → `zep`.

4. **Routing action.** A `zep` recommendation's next step is a **deeplink into the Zeps builder prefilled with the scoped need** (`buildZepsBuilderUrl` in `lib/zeps.ts`), NOT a scaffold repo. If the brief flow currently sends every non-kill modality to the repo scaffold, branch `zep` to the Zeps deeplink instead. (If wiring the deeplink is more than a small change, stop and flag it — at minimum the modality value/definition/default must be correct.)

## Do NOT
- Do not add Plato as a modality. (Per ground truth: Plato only does incremental changes on existing repos at ~30% merge rate, no greenfield — it is not a build path for a new tool.)
- Do not touch the `zep`/`zeps` catalogue tool type (that's for listing finished Zeps and is already correct).

## Validation
Typecheck only; don't run the suite/harness locally. Update the `e2eConversations.ts` expectation for scenario 4 (daily bookings → Slack) to `zep`. Commit; I'll re-run the harness in Replit.

## Acceptance
Scenario 4 (bookings→Slack) → modality `zep`. The scope agent's decision guide names Zep as the default for workflow automations and only recommends a custom app with a stated reason Zeps can't serve it.

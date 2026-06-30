---
name: Concierge build-gate funnel stage
description: Why the chat hand-off UI is gated on a funnel `stage`, not on `noMatch`.
---

The concierge chat (`chatAgent.ts`) enforces a strict search-first build gate: it
always searches the catalogue first (even for "build me X"), presents any matches
and asks if one fits, then asks up to 3 scoping questions one at a time, and only
then recommends ONE best-fit builder via a `hand_off_to_builder` function tool.

The build/Slack hand-off UI is gated on `ChatResult.stage === "handoff"`, NOT on
`noMatch`. `noMatch` only means "no catalogue tool recommended this turn" — a
scoping question is `noMatch: true` but must NOT show build buttons.

**Why:** "no catalogue match" alone used to immediately render one-click build
buttons, letting users skip confirmation + scoping. Building must be the end of a
funnel, never a first move, and must never default to Zeps.

**How to apply:**
- The agent signals hand-off only by calling `hand_off_to_builder` (builder enum
  replit/claude-code/claude-skill/zeps + reason + prompt). The loop sets `stage`
  + `recommendedBuilder` + `buildPrompt` from that call.
- `stage`/`recommendedBuilder`/`buildPrompt` are persisted on the `messages` table
  so reopened conversations re-render the same hand-off with the same primary
  builder. Any new funnel signal must be persisted there too or saved chats lose it.
- Frontend renders builders via `orderedBuilders(recommendedBuilder)` (recommended
  first = primary) and `builderUrl(id, prompt)`; never re-introduce a hard-coded
  Zeps-first block.

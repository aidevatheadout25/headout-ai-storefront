# UI standardization + interaction fixes (NOT an SDK change)

User feedback: the UI is hard to use — e.g. copying a chat isn't possible, "New chat" requires scrolling to the top to reach, and general inconsistency. Goal: standardize the UI and fix the rough interactions. **This is UI/UX work — do NOT introduce Vercel AI SDK or change the agent/backend layer; none of these issues are backend.**

Work in `artifacts/storefront/src`. Use the existing Headout design system (`public/design-system/colors_and_type.css` — Halyard fonts + tokens) as the single source of styling. Where components use ad-hoc colors/spacing/fonts, replace with design-system tokens.

## Interaction fixes (the reported pain)

1. **Persistent "New chat".** Move it out of the scroll flow — a sticky header/toolbar control (and/or the sidebar) so it's reachable from anywhere without scrolling to the top. Always visible while a conversation is open.
2. **Copy affordances.**
   - Copy-message: a small copy button on each assistant message (hover or always-visible on mobile), copies that message's text.
   - Copy-conversation: one action (in the header or an overflow menu) that copies the whole transcript as clean text/markdown.
3. **Scroll behavior.** Autoscroll to the newest message while streaming/replying; a "scroll to bottom" affordance appears when the user has scrolled up; don't yank the view if the user scrolled up deliberately.
4. **Sticky input.** The input stays pinned at the bottom, visible without scrolling, with clear send/disabled states.
5. **Audit other small snags** the user hinted at ("a bunch of other such issues") — obvious clunk in message rendering, chip behavior, empty state, mode indicator placement. List anything you find; fix the cheap, clearly-broken ones; flag anything larger.

## Standardization pass

6. Consistent use of design-system tokens for color, type (Halyard), spacing, radius, and buttons across every screen (home chat, registry, tool detail, cards). Replace one-off inline styles with tokens/shared components.
7. Consolidate repeated UI into shared components (Button, Card, IconButton, Header) if not already — so behavior (copy, new-chat, scroll) is defined once and consistent everywhere.

## Constraints
- No changes to `chatAgent.ts`, routes, DB, or the agent logic. Pure frontend.
- Keep existing responsive behavior; no new breakpoints unless something is clearly broken.
- Don't add heavy UI dependencies. Use the existing stack + design system. (If you believe a standard chat-UI kit is genuinely warranted, stop and propose it — don't install it unprompted.)

## Validation
Typecheck the storefront package. Since this is visual, describe the before/after for each fix and, if you can, capture or describe the rendered result. Commit with a clear message.

## Acceptance
"New chat" reachable without scrolling from any point in a conversation; copy-message and copy-conversation both work; scrolling feels natural during replies; every screen uses Halyard + design-system tokens, no ad-hoc styling left in the touched components.

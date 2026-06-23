# Headout AI Storefront — Product Audit

**Audited:** June 23, 2026  
**Against:** `PRD-headout-ai-storefront-v1.md.docx`, Headout design system (`SKILL.md`), and implementation in `app/`, `components/`, `context/AppContext.tsx`, `lib/`  
**Method:** End-to-end persona walkthroughs with code-path tracing (not a code review)

---

## Summary

The prototype credibly demonstrates the PRD’s June 25 demo scope: homepage search, registry browse, tool detail with access gating, submit flow with dedup nudge, role-differentiated UI, admin approval queue with reject reasons, and edit/resubmit. Thin-layer positioning is mostly honored — Storefront catalogues, points, and triggers requests without holding credentials or granting access. Zero-results on the homepage ask-bar is well handled.

Gaps cluster around **feedback loops that stop at in-memory state** (access requests, zero-result query text, owner transfer), **lifecycle edges** (archived is a one-way door; auto-decay is display-only), and **role-demo footguns** (switching back to Viewer after submitting blocks edit/resubmit). Several admin metrics read as live product signal but are mocked. Design-system adherence is strong (Onix icons, tokens, sentence case); accessibility is partial on modals and mobile header density.

**Demo-readiness verdict: ready-with-risks** — safe for a guided demo on the happy paths; risky if stakeholders free-navigate into pending-edit, role-switch, filter-only zero-results, gibberish search, or archived lifecycle.

---

## What's working well

- **Discovery → detail → outbound click** is coherent: search (`components/AskBar.tsx`), registry filters (`components/RegistryView.tsx`), cards (`components/ToolCard.tsx`), and detail CTA (`components/ToolDetailView.tsx:91-94`, `504-508`) with click tracking (`context/AppContext.tsx:313-329`).
- **Zero-results on homepage search** offers kits, “Register this need”, and Slack — not a dead end (`components/ZeroResultsPanel.tsx:14-58`, `lib/askBar.ts:127-135`).
- **Submit → pending → approve/reject → status** loop works with visible reject reasons on detail and my-submissions (`context/AppContext.tsx:281-295`, `components/ToolDetailView.tsx:237-251`, `components/MySubmissionsView.tsx:59-77`).
- **Viewer submit promotes to Builder** matches the product principle that submission is the on-ramp (`components/ToolForm.tsx:128-134`, `components/RoleSwitcher.tsx:40-41`).
- **Deprecated vs archived** is differentiated in copy, ranking, and admin flag actions (`lib/toolMeta.ts:7-13`, `components/ToolDetailView.tsx:452-479`, `lib/flagReasons.ts:37-54`, `context/AppContext.tsx:362-384`).
- **Access gating** correctly blocks “Go to tool” for non-open tools and states Storefront does not grant access (`lib/toolMeta.ts:122-128`, `components/ToolDetailView.tsx:482-524`).
- **Design system**: Onix-only icons (`components/Icon.tsx:21-38`), CSS token variables (`app/globals.css`, `public/design-system/colors_and_type.css`), sentence-case CTAs, Purps used sparingly for primary actions.

---

## Findings

Sorted by severity (P0 → P2).

| ID | Severity | Persona & flow | What happens now | What should happen | Recommended fix | Effort |
|----|----------|----------------|------------------|-------------------|-----------------|--------|
| F01 | P0 | Builder — edit pending submission | `canEditTool` only allows edit when `approvalStatus` is `approved` or `rejected` (`context/AppContext.tsx:194-202`). Edit page 404s for pending tools (`app/edit/[id]/page.tsx:14-18`). Pending detail sidebar only says “Waiting on admin review” with no edit action (`components/ToolDetailView.tsx:534-541`). | Builder can correct typos or wrong links while a submission is still in queue. | Allow `canEditTool` for own pending tools; add `updatePendingTool` in context; surface “Edit submission” on pending detail and my-submissions. | M |
| F02 | P0 | Builder — rejected resubmit after role switch | First submit auto-promotes Viewer → Builder (`components/ToolForm.tsx:128-134`). If demo role is switched back to Viewer, `canEditTool` returns false for the same user’s tools (`context/AppContext.tsx:197-199`). Edit page shows “You can't edit this tool” (`app/edit/[id]/page.tsx:21-28`) even though they submitted. | Anyone who has submitted should retain edit/resubmit ability regardless of demo role label, or role switcher should warn/persist builder capability. | Gate edit on `submittedBy === currentUser.id` (not only `role === "builder"`), or persist a `isBuilder` flag set on first submit. | S |
| F03 | P0 | Owner — archive lifecycle | `canManage` is false when `status === "archived"` (`components/ToolDetailView.tsx:590`). Restore UI exists only for `deprecated` (`components/ToolDetailView.tsx:600-627`). `archiveTool` sets archived with no unarchive path (`context/AppContext.tsx:406-410`). | Archived is admin/owner decision, not irreversible in UI; owners need restore or transfer-off before archive confirm explains permanence. | Add “Restore from archive” for admin/owner, or hide Archive behind stronger confirm + keep deprecated as the soft off-ramp only. Seed one archived tool in mock data for demo. | M |
| F04 | P1 | Viewer — gibberish / empty search | Gibberish fallback renders only a message card, no next steps (`components/AskBar.tsx:108-112`, `lib/askBar.ts:10`). Unlike `no-match`, it does not render `ZeroResultsPanel`. | Every failed search path offers register-idea + Slack + browse registry (product principle: zero-results never a dead end). | Reuse `ZeroResultsPanel` (or a slim variant) for `reason === "gibberish"` with coaching copy. | S |
| F05 | P1 | Viewer — registry filter zero-results | `ZeroResultsPanel` only when `hasActiveFilters && search` (`components/RegistryView.tsx:251-255`). Type/team/kit filters alone show generic `EmptyState` with clear-filters CTA only (`components/RegistryView.tsx:257-274`) — no register-need or Slack. | Filter dead-ends get the same escape hatches as search dead-ends. | Show `ZeroResultsPanel` (or shared actions) whenever `filtered.length === 0 && hasActiveFilters`, passing best-effort query from search or active kit name. | S |
| F06 | P1 | Admin — metrics / zero-result signal | UI claims “Top zero-result queries” and “Roadmap signal” (`components/AdminMetricsView.tsx:69-105`). `recordZeroResultSearch` increments a counter only; query string is discarded (`context/AppContext.tsx:424-426`). Top queries are hardcoded mock data (`lib/adminMetrics.ts:6-12`, `46-56`). | Metrics reflect actual session searches or are clearly labeled demo-only. | Store `{ query, count }[]` in context; merge into `computeAdminMetrics`; add “demo data” badge until backend exists. | M |
| F07 | P1 | Builder / Owner — access request feedback | `requestAccess` appends tool id to in-memory array (`context/AppContext.tsx:332-336`). User sees confirmation (`components/ToolDetailView.tsx:511-518`). **Owner and admin never see the queue** — no surface for `accessRequests`. | Request is a trigger: owner (or platform) gets a visible queue or Slack handoff; requester sees pending vs fulfilled. | Add owner/admin “Access requests” panel or badge; optional mock “notify owner on Slack”. | M |
| F08 | P1 | Admin — approval context | Approval cards show owner, not submitter (`components/ApprovalsView.tsx:147-149`). No `submittedBy` / submit date in queue. | Admin can distinguish “who filed” vs “who owns” for wrong-owner and junk submissions. | Display submitter name/id and submitted date on `ApprovalCard` and pending detail banner. | S |
| F09 | P1 | Owner — auto-decay (PRD S10) | `isStaleTool` / “Stale” chip displays after 90 days (`lib/toolMeta.ts:114-116`, `components/FreshnessLine.tsx:27-30`). No owner ping, no auto-archive, no transfer prompt. Zendesk bot is deprecated + stale in seed data (`lib/mockData.ts:284-305`) but nothing escalates. | Stale tools surface owner action: confirm still live, deprecate, transfer, or archive. | Add owner/admin “Stale tools” queue or inline CTA on stale chip; wire to deprecate/transfer/archive actions. | L |
| F10 | P1 | Owner — transfer handoff | Transfer updates owner in state (`context/AppContext.tsx:397-404`). Copy says “they'll be notified on Slack (mocked)” (`components/ToolDetailView.tsx:361-363`) with **no notification, no pending confirm for new owner**. New owner only sees confirm chip if they visit detail (`components/ToolDetailView.tsx:550-558`). | Named owner receives an actionable prompt to confirm; old owner sees transfer completed. | Toast/banner for new owner in demo; set `ownerConfirmed: false` on transfer (already done) + add “pending your confirmation” to their submissions or home. | M |
| F11 | P1 | Admin — wrong-owner / duplicate flags | `suggestedFlagAction` returns `null` for `wrong-owner` and `duplicate` (`lib/flagReasons.ts:46-49`). Admin can only dismiss, deprecate, or archive (`components/ApprovalsView.tsx:69-88`) — no reassign owner or merge/link duplicate. | Flags match resolution paths: wrong-owner → transfer; duplicate → link canonical entry. | Add “Transfer owner” and “Mark as duplicate of…” actions on flagged cards. | M |
| F12 | P1 | Viewer — org-knowledge ask (PRD S5) | Ask-bar is keyword tool search only (`lib/askBar.ts:34-105`). No route for “how do I get BigQuery access?” style questions. Gibberish/no-match messages don’t point to KB (`lib/askBar.ts:9-10`). | Classify intent; KB answers with source or honest Slack fallback per PRD behavior spec. | Out of demo scope is acceptable if labeled; for product audit: add stub “org knowledge” responses for 2–3 demo queries or badge ask-bar as “tool search only”. | L |
| F13 | P1 | Builder — edit live without re-review | `updateTool` writes directly to approved catalog (`context/AppContext.tsx:226-241`). Edit page copy: “changes go live immediately” (`app/edit/[id]/page.tsx:43`). | Clarify policy: minor edits OK vs material changes need re-approval — at minimum surface “last updated” freshness. | Add banner on edit for sensitive/write-capable tools; optional admin notification for MCP/sensitive edits. | M |
| F14 | P2 | Viewer — post-submit tracking | “My submissions” nav hidden until `hasSubmissions` (`components/Header.tsx:54-61`). Direct URL works with empty state. After first submit, confirmation links to my-submissions (`components/ToolForm.tsx:192-194`) but not to the new tool’s detail page (submit returns id at `context/AppContext.tsx:219-223` but confirmation doesn’t use it). | Immediate link to submitted entry for status tracking. | Pass `submitTool` return id to confirmation; add “View your submission” primary CTA. | S |
| F15 | P2 | Viewer — improvement request | “Request an improvement” uses `mailto:${tool.owner.slackId}` (`components/ToolDetailView.tsx:575-579`). Slack IDs are not email addresses — link is broken. | Deep-link to Slack DM or `#channel` per `accessContact` / owner instructions. | Replace with `STOREFRONT_SLACK_URL` pattern or `slack://user?...` mock. | S |
| F16 | P2 | All — modal accessibility | Flag and transfer dialogs lack Escape handler, focus trap, and initial focus (`components/ToolDetailView.tsx:291-390`). Backdrop click closes only. | Keyboard and screen-reader users can complete flows safely. | Add `useEffect` focus trap, Escape to close, `aria-modal="true"`. | S |
| F17 | P2 | All — mobile header | Desktop nav hidden ≤768px; role switcher shrinks to 10px labels (`app/globals.css:459-477`). Mobile nav is horizontal scroll (`app/globals.css:480-501`) — crowded with Admin links. | Usable role switching and nav on phone widths. | Collapse nav into menu sheet; keep role switcher readable (min 12px, full labels). | M |
| F18 | P2 | Admin — approval success feedback | Approve from detail redirects admin to queue (`components/ToolDetailView.tsx:145-147`). **Submitter gets no in-app notification** — must poll my-submissions. | Submitter sees status change without polling (banner, email, Slack mock). | On approve/reject, set a `lastNotification` on tool; show banner when submitter opens my-submissions or home. | M |
| F19 | P2 | Demo — archived lifecycle story | Seed data has `deprecated` (zendesk-triage-bot) but **no `archived` tool** (`lib/mockData.ts` — only `deprecated` at line 298). Archive flow exists in UI but is undemoable from catalog. | Stakeholders can see full lifecycle spectrum in registry/search ranking. | Add one `archived` mock tool; verify low ranking in `lib/registry.ts:6-11`. | S |
| F20 | P2 | PRD vs product principles — Viewer submit | PRD role table: Viewer “Cannot submit.” Prototype: `canSubmit = true` always (`context/AppContext.tsx:177`), submit page open to all (`app/submit/page.tsx:14-17`). | Align spec: either update PRD to “submit promotes to Builder” or gate form for Viewer. | Document intentional deviation in demo script; optional Viewer read-only submit page with CTA to register idea only. | S |
| F21 | P2 | Design — status badge title case | `formatLifecycleStatus` returns “Live”, “Beta”, etc. with capital L (`lib/toolMeta.ts:53-69`). Design system calls for sentence case in tags. Minor inconsistency. | Tags use sentence case: “Live” → acceptable; ensure headings/CTAs stay sentence case. | Audit display strings; lower-case where tags are mid-sentence. | S |
| F22 | P2 | Viewer — sensitive tool discovery | Sensitive tools are visible with badge; instructions may mention credentials (`lib/mockData.ts:128`). Storefront does not store secrets — OK. Detail explicitly disclaims granting access (`components/ToolDetailView.tsx:492-495`). | Keep thin-layer boundary visible in demo. | No change required; call out in demo script as intentional. | — |

---

## Persona walkthrough notes

### 1. Viewer

| Step | Result |
|------|--------|
| Land home | Hero + ask-bar + kits + MCP panel (`app/page.tsx`). First-run strip (`components/FirstRunExplainer.tsx`). |
| Search / ask | Keyword match works (`lib/askBar.ts:34-78`). No semantic/vector search (expected for prototype). |
| Zero results | `ZeroResultsPanel` with register + Slack (`components/ZeroResultsPanel.tsx`) — **good**. |
| Gibberish query | Message only — **dead end** (F04). |
| Find tool → use | Open detail → “Go to tool” if open (`lib/toolMeta.ts:122-128`). Gated tools show request CTA. |
| Request access | Confirmation shown; owner unaware (F07). |
| Register idea | `/submit?status=planned` from hero (`app/page.tsx:32-36`) and zero-results — **good**. |
| Report problem | Flag → admin queue (`context/AppContext.tsx:338-354`, `components/ApprovalsView.tsx:312-332`) — **good**. |

### 2. Builder

| Step | Result |
|------|--------|
| Submit tool | Form + dedup nudge (`components/ToolForm.tsx:236-250`). Promotes to builder (F20). |
| Submit idea | Planned status, optional link (`components/ToolForm.tsx:82-332`) — **good**. |
| Track status | My submissions list with badges (`components/MySubmissionsView.tsx`) — after first submit. |
| Rejected → resubmit | Reject reason visible; edit/resubmit works **if role stayed Builder** (F02). |
| Edit pending | **Blocked** (F01). |
| Own live tool | Edit immediate (`context/AppContext.tsx:226-241`). Manage deprecate/archive/transfer on detail. |
| Hand off | Transfer works in state; weak new-owner loop (F10). |

### 3. Admin

| Step | Result |
|------|--------|
| Review queue | Split idea vs go-live (`components/ApprovalsView.tsx:251-381`). Badge count in header (`components/Header.tsx:22-23`). |
| Full detail | Link from card (`components/ApprovalsView.tsx:141-144`). Approve/reject on detail (`components/ToolDetailView.tsx:179-225`). |
| Reject with reason | Reason stored in `rejectReason` and shown to submitter — **not a broken promise** (`context/AppContext.tsx:286-290`, `components/MySubmissionsView.tsx:59-66`). |
| Handle flag | Dismiss / deprecate / archive (`components/ApprovalsView.tsx:69-88`). Wrong-owner/duplicate lack specific actions (F11). |
| Deprecate vs archive | Distinct copy and flag suggestions (`lib/flagReasons.ts:37-54`) — **good**. |
| Metrics | Partially mocked (F06). Status breakdown from live state (`lib/adminMetrics.ts:28-39`) — **good**. |

### 4. Returning owner

| Step | Result |
|------|--------|
| Named as owner | `ownerConfirmed: false` shows chip + confirm CTA (`components/OwnerConfirmationChip.tsx`, `components/ToolDetailView.tsx:550-558`). PDP image optimiser seeded for Alex Kim (`lib/mockData.ts:307-329`). |
| Confirm | `confirmOwnership` sets flag (`context/AppContext.tsx:386-395`). |
| Maintain | Deprecate with restore path (`components/ToolDetailView.tsx:628-655`). |
| Archive | One-way in UI (F03). |
| Transfer | State updates; no new-owner notification (F10). |
| Stale tools | Chip only — silent rot (F09). |

---

## Top 5 to fix before the demo (June 25)

1. **F01 — Let builders edit pending submissions** — most likely question in “Submit a tool” live demo.
2. **F02 — Don’t let role switcher revoke resubmit rights** — demo uses role switcher heavily; rejection path breaks under Viewer.
3. **F04 — Gibberish search escape hatches** — executives will type something unparseable in the ask-bar.
4. **F06 — Label or wire real zero-result metrics** — avoid crediting mocked query list in Metrics walkthrough.
5. **F19 — Seed one archived catalog entry** — completes the deprecated ≠ archived story in registry + detail.

---

## Out of scope (acceptable for June 25 prototype)

Per PRD demo scope: live semantic search, Google SSO, working MCP server, Slack integration, backend persistence, auto-decay automation, and org-knowledge Q&A. MCP panel is clearly labeled illustrative (`components/McpUsePanel.tsx:32-35`).

---

## Audit metadata

- **PRD reference:** `PRD-headout-ai-storefront-v1.md.docx` (v1, June 23, 2026)
- **Design system:** `headout-design-system/SKILL.md` + linked `colors_and_type.css`
- **No code changes** were made as part of this audit.

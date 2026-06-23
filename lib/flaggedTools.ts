import type { ToolFlag } from "@/lib/types";

export const INITIAL_FLAGGED_TOOLS: ToolFlag[] = [
  {
    id: "flag-1",
    toolId: "zendesk-triage-bot",
    toolName: "Zendesk triage bot",
    reason: "Link is dead and description is outdated for 2026 workflows.",
    reporterName: "Tom Walsh",
    reporterSlackId: "@tom.w",
    createdAt: "2026-06-20T09:00:00Z",
  },
];

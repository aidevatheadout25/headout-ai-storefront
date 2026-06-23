import type { ToolFlag } from "@/lib/types";

export const INITIAL_FLAGGED_TOOLS: ToolFlag[] = [
  {
    id: "flag-1",
    toolId: "zendesk-triage-bot",
    toolName: "Zendesk triage bot",
    reasonCategory: "outdated",
    note: "Description still references 2025 Zendesk workflows.",
    reporterName: "Tom Walsh",
    reporterSlackId: "@tom.w",
    createdAt: "2026-06-20T09:00:00Z",
  },
  {
    id: "flag-2",
    toolId: "pricing-audit-mcp",
    toolName: "Pricing audit MCP",
    reasonCategory: "broken-link",
    note: "MCP endpoint returns 404 since the repo moved.",
    reporterName: "Alex Kim",
    reporterSlackId: "@alex.kim",
    createdAt: "2026-06-21T14:30:00Z",
  },
];

import type { Tool, ToolLifecycleStatus, ZeroResultQuery } from "@/lib/types";

export const GATE_ELIGIBILITY_NOTE =
  "Approval makes this tool eligible for infra access — the platform team grants the actual access.";

export const MOCK_TOP_ZERO_RESULT_QUERIES: ZeroResultQuery[] = [
  { query: "figma plugin for PDP crops", count: 14 },
  { query: "internal LLM router", count: 11 },
  { query: "zendesk auto-triage replacement", count: 9 },
  { query: "competitor price API", count: 8 },
  { query: "bigquery cost dashboard", count: 6 },
];

export const MOCK_ZERO_RESULTS_BASE_COUNT = 47;

export type AdminMetrics = {
  totalTools: number;
  statusBreakdown: Record<ToolLifecycleStatus, number>;
  submissionsThisWeek: number;
  zeroResultsCount: number;
  topZeroResultQueries: ZeroResultQuery[];
};

export function computeAdminMetrics(
  tools: Tool[],
  extraZeroResults: number,
): AdminMetrics {
  const catalog = tools.filter((t) => t.approvalStatus === "approved");
  const statusBreakdown: Record<ToolLifecycleStatus, number> = {
    planned: 0,
    beta: 0,
    live: 0,
    deprecated: 0,
    archived: 0,
  };

  for (const tool of catalog) {
    statusBreakdown[tool.status] += 1;
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const submissionsThisWeek = tools.filter(
    (t) => new Date(t.lastUpdated).getTime() >= weekAgo,
  ).length;

  const liveTop = [...MOCK_TOP_ZERO_RESULT_QUERIES];
  if (extraZeroResults > 0) {
    liveTop[0] = { ...liveTop[0], count: liveTop[0].count + extraZeroResults };
  }

  return {
    totalTools: catalog.length,
    statusBreakdown,
    submissionsThisWeek,
    zeroResultsCount: MOCK_ZERO_RESULTS_BASE_COUNT + extraZeroResults,
    topZeroResultQueries: liveTop,
  };
}

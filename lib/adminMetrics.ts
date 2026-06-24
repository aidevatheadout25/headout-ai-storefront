import type { NeedRequest, Tool, ToolLifecycleStatus, ZeroResultQuery } from "@/lib/types";

export const GATE_ELIGIBILITY_NOTE =
  "Approval makes this tool eligible for infra access — the platform team grants the actual access.";

export type AdminMetrics = {
  totalTools: number;
  statusBreakdown: Record<ToolLifecycleStatus, number>;
  submissionsThisWeek: number;
  zeroResultsCount: number;
  topZeroResultQueries: ZeroResultQuery[];
  parkedSignals: { title: string; reason: string; sourceQuery?: string }[];
};

export function computeAdminMetrics(
  tools: Tool[],
  zeroResultQueries: ZeroResultQuery[],
  parkedRequests: NeedRequest[],
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

  const totalZeroResults = zeroResultQueries.reduce((sum, q) => sum + q.count, 0);
  const topZeroResultQueries = [...zeroResultQueries]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const parkedSignals = parkedRequests
    .filter((r) => r.status === "parked")
    .map((r) => ({
      title: r.title,
      reason: r.parkedReason ?? r.problem,
      sourceQuery: r.sourceQuery,
    }))
    .slice(0, 8);

  return {
    totalTools: catalog.length,
    statusBreakdown,
    submissionsThisWeek,
    zeroResultsCount: totalZeroResults,
    topZeroResultQueries,
    parkedSignals,
  };
}

import type { Role, Team, Tool } from "@/lib/types";

/** Mock team shifts with role so recommendations visibly change in the demo. */
export const ROLE_MOCK_TEAM: Record<Role, Team> = {
  viewer: "Growth",
  builder: "Applied AI",
  admin: "Platform",
};

const ROLE_TYPE_BOOST: Record<Role, string[]> = {
  viewer: ["dashboard", "app", "slack-bot"],
  builder: ["skill", "mcp", "script", "plugin"],
  admin: ["dashboard", "mcp", "plugin"],
};

const ROLE_TAG_BOOST: Record<Role, string[]> = {
  viewer: ["analytics", "growth", "pricing", "scraping"],
  builder: ["claude", "agents", "mcp", "scraping"],
  admin: ["platform", "auth", "bigquery", "debug", "booking"],
};

export function getRecommendedTools(
  role: Role,
  tools: Tool[],
  limit = 4,
): Tool[] {
  const mockTeam = ROLE_MOCK_TEAM[role];
  const typeBoost = new Set(ROLE_TYPE_BOOST[role]);
  const tagBoost = new Set(ROLE_TAG_BOOST[role]);

  return [...tools]
    .filter((t) => t.approvalStatus === "approved")
    .map((tool) => {
      let score = tool.usageStats.views * 0.01 + tool.usageStats.helpful;

      if (tool.team === mockTeam) score += 50;
      if (tool.types.some((t) => typeBoost.has(t))) score += 20;
      if (tool.tags.some((tag) => tagBoost.has(tag))) score += 15;

      if (role === "admin" && tool.accessLevel !== "open") score += 10;
      if (role === "builder" && tool.submittedBy === "alex-kim") score += 25;

      return { tool, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ tool }) => tool);
}

export function getMockTeamLabel(role: Role): string {
  return ROLE_MOCK_TEAM[role];
}

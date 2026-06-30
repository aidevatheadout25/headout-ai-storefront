import type { Tool, ToolLifecycleStatus, ToolType } from "@/lib/types";

export const STOREFRONT_SLACK_CHANNEL = "#project-ai-internal-storefront";
export const STOREFRONT_SLACK_URL =
  "https://headout.slack.com/archives/project-ai-internal-storefront";

/** Mock Slack channel for improvement requests — not email. */
export const IMPROVEMENT_REQUEST_SLACK_URL = STOREFRONT_SLACK_URL;

/**
 * Builder options offered when the catalogue has no match. The concierge is not
 * forced to Zeps — Zeps is one internal option among several public builders.
 * (Zeps is rendered separately because its link is seeded with the user's ask.)
 */
export type BuilderOption = { id: string; label: string; url: string };
export const BUILDER_OPTIONS: BuilderOption[] = [
  { id: "replit", label: "Build on Replit", url: "https://replit.com" },
  {
    id: "claude-code",
    label: "Build with Claude Code",
    url: "https://www.anthropic.com/claude-code",
  },
  {
    id: "claude-skill",
    label: "Make a Claude skill",
    url: "https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview",
  },
];

const SUBMITTER_LABELS: Record<string, string> = {
  "alex-kim": "Alex Kim (@alex.kim)",
  "jordan-lee": "Jordan Lee (@jordan.lee)",
  "maya-patel": "Maya Patel (@maya.p)",
  "sofia-reyes": "Sofia Reyes (@sofia.r)",
  "tom-walsh": "Tom Walsh (@tom.w)",
  "priya-sharma": "Priya Sharma (@priya.s)",
};

export function formatSubmitterLabel(submittedBy: string): string {
  return (
    SUBMITTER_LABELS[submittedBy] ??
    submittedBy
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function formatSubmissionDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const LIFECYCLE_RANK: Record<ToolLifecycleStatus, number> = {
  live: 0,
  beta: 1,
  planned: 2,
  deprecated: 3,
  archived: 4,
};

const STALE_DAYS = 90;

export const LIFECYCLE_STATUS_STYLES: Record<
  ToolLifecycleStatus,
  { bg: string; color: string; bgDark: string; colorDark: string }
> = {
  live: {
    bg: "var(--color-okaygreen-200)",
    color: "var(--color-okaygreen-800)",
    bgDark: "var(--color-okaygreen-800)",
    colorDark: "var(--color-okaygreen-300)",
  },
  beta: {
    bg: "var(--color-joymustard-200)",
    color: "var(--color-joymustard-800)",
    bgDark: "var(--color-joymustard-800)",
    colorDark: "var(--color-joymustard-300)",
  },
  planned: {
    bg: "var(--color-dreamypale-400)",
    color: "var(--color-dreamypale-800)",
    bgDark: "var(--color-dreamypale-800)",
    colorDark: "var(--color-dreamypale-400)",
  },
  deprecated: {
    bg: "var(--color-peachyorange-200)",
    color: "var(--color-peachyorange-800)",
    bgDark: "var(--color-peachyorange-800)",
    colorDark: "var(--color-peachyorange-200)",
  },
  archived: {
    bg: "var(--color-grey-200)",
    color: "var(--color-grey-600)",
    bgDark: "var(--color-grey-900)",
    colorDark: "var(--color-grey-500)",
  },
};

export function formatLifecycleStatus(status: ToolLifecycleStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "beta":
      return "Beta";
    case "planned":
      return "Planned";
    case "deprecated":
      return "Deprecated";
    case "archived":
      return "Archived";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function formatAccessLevel(level: Tool["accessLevel"]): string {
  switch (level) {
    case "open":
      return "Open";
    case "request":
      return "Request";
    case "sensitive":
      return "Sensitive";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function compareLifecycle(a: Tool, b: Tool): number {
  return LIFECYCLE_RANK[a.status] - LIFECYCLE_RANK[b.status];
}

export function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function formatRelativeDate(isoDate: string): string {
  const days = daysSince(isoDate);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function isStaleTool(tool: Tool): boolean {
  return daysSince(tool.lastUsed) >= STALE_DAYS;
}

export function isCatalogVisible(tool: Tool): boolean {
  return tool.approvalStatus === "approved";
}

/** Only http(s) links are safe to render as actionable outbound links. */
export function isSafeToolLink(link: string): boolean {
  if (!link) return false;
  try {
    const { protocol } = new URL(link);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function canOpenToolLink(tool: Tool): boolean {
  return (
    isSafeToolLink(tool.link) &&
    tool.status !== "archived" &&
    !tool.linkUnreachable &&
    tool.accessLevel === "open"
  );
}

export function isIdeaSubmission(tool: Tool): boolean {
  return tool.status === "planned" && !tool.link.trim();
}

export function isGoLiveSubmission(tool: Tool): boolean {
  return !isIdeaSubmission(tool);
}

export function toolHasMcpType(tool: Tool): boolean {
  return tool.types.includes("mcp");
}

export function isOwnerMatch(
  ownerSlackId: string,
  currentSlackId: string,
): boolean {
  return ownerSlackId.trim().toLowerCase() === currentSlackId.trim().toLowerCase();
}

export function isCurrentUserOwner(tool: Tool, currentSlackId: string): boolean {
  return isOwnerMatch(tool.owner.slackId, currentSlackId);
}

export function passesLightApprovalCheck(tool: Tool): boolean {
  return (
    Boolean(tool.name.trim()) &&
    Boolean(tool.owner.name.trim()) &&
    Boolean(tool.owner.slackId.trim()) &&
    tool.oneLiner.trim().length >= 8
  );
}

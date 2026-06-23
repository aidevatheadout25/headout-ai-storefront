export type Role = "admin" | "builder" | "viewer";

export type ToolType =
  | "app"
  | "skill"
  | "mcp"
  | "plugin"
  | "script"
  | "slack-bot"
  | "dashboard";

export type AccessLevel = "open" | "gated";

export type ToolStatus = "approved" | "pending" | "rejected";

export type Team =
  | "Platform"
  | "Applied AI"
  | "Supply Ops"
  | "Growth"
  | "Content";

export type Owner = {
  name: string;
  slackId: string;
};

export type UsageStats = {
  views: number;
  clicks: number;
  helpful: number;
};

export type Tool = {
  id: string;
  name: string;
  oneLiner: string;
  description: string;
  type: ToolType;
  link: string;
  owner: Owner;
  team: Team;
  tags: string[];
  accessLevel: AccessLevel;
  accessContact?: string;
  githubUrl?: string;
  status: ToolStatus;
  submittedBy: string;
  usageStats: UsageStats;
  rejectReason?: string;
};

export type ToolFormData = {
  name: string;
  oneLiner: string;
  type: ToolType;
  link: string;
  ownerName: string;
  ownerSlackId: string;
  team: Team;
  tags: string;
  accessLevel: AccessLevel;
  githubUrl: string;
  description: string;
};

export type AskResultType = "tools" | "knowledge" | "fallback";

export type AskToolResult = {
  type: "tools";
  query: string;
  tools: Tool[];
};

export type AskKnowledgeResult = {
  type: "knowledge";
  query: string;
  answer: string;
  sources: { label: string; url: string }[];
  uncertain?: boolean;
};

export type AskFallbackResult = {
  type: "fallback";
  query: string;
  message: string;
};

export type Kit = {
  id: string;
  name: string;
  description: string;
  toolIds: string[];
  accentVar: string;
};

export type AskResult = AskToolResult | AskKnowledgeResult | AskFallbackResult;

export const TOOL_TYPES: ToolType[] = [
  "app",
  "skill",
  "mcp",
  "plugin",
  "script",
  "slack-bot",
  "dashboard",
];

export const TEAMS: Team[] = [
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  builder: "Builder",
  viewer: "Viewer",
};

export function formatToolType(type: ToolType): string {
  switch (type) {
    case "slack-bot":
      return "Slack bot";
    case "mcp":
      return "MCP";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

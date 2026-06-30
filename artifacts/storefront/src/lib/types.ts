export type Role = "member" | "admin";

export type ToolType =
  | "app"
  | "skill"
  | "docs"
  | "mcp"
  | "plugin"
  | "script"
  | "slack-bot"
  | "zep";

export type AccessLevel = "open" | "request" | "sensitive";

export type ApprovalStatus = "approved" | "pending" | "rejected";

export type ToolLifecycleStatus =
  | "planned"
  | "beta"
  | "live"
  | "deprecated"
  | "archived";

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

export type StakesLevel = "low" | "high";

export type RiskAnswer = "no" | "yes" | "unsure";

export type RequestPrerequisites = {
  dataSources: string;
  systems: string;
  inputsOutputs: string;
  touchesPII: RiskAnswer;
  touchesPayments: RiskAnswer;
  usesLLM: RiskAnswer;
  needsExternalDep: RiskAnswer;
};

export type RequestValidation = {
  problem: string;
  whoHasIt: string;
  frequency: string;
  currentWorkaround: string;
  expectedValue: string;
};

export type BuildPath =
  | "claude-skill"
  | "claude-skill-mcp"
  | "replit"
  | "claude-code"
  | "real-app";

export type BuildPathRecommendation = {
  path: BuildPath;
  headline: string;
  rationale: string;
  firstSteps: string[];
  toolType: ToolType;
};

export type PmRecommendation = {
  reasoning: string[];
  scopedPlan: string;
  buildPath: BuildPathRecommendation;
  stakesLevel: StakesLevel;
  reuseNote?: string;
  nearMatchNote?: string;
  stakesNote?: string;
};

export type BuildingBlockKind = "api" | "service" | "agent" | "framework";

export type BuildingBlockStatus = "live" | "beta" | "planned";

export type BuildingBlock = {
  id: string;
  name: string;
  kind: BuildingBlockKind;
  description: string;
  capabilityTags: string[];
  owner: Owner;
  accessLevel: AccessLevel;
  status: BuildingBlockStatus;
};

export type DecisionRuleRecommend =
  | { type: "buildingBlock"; buildingBlockId: string }
  | { type: "text"; text: string };

export type DecisionRule = {
  id: string;
  matches: string[];
  recommend: DecisionRuleRecommend;
  stakes: StakesLevel;
  message: string;
};

export type ChosenStack = {
  framework: string;
  hosting: string;
  auth: string;
  justification?: string;
  needsAdminSignoff?: boolean;
};

export type ChosenApproach = {
  form: ToolType;
  recommendation: string;
  override?: boolean;
  justification?: string;
};

export type FunnelStage =
  | "describe"
  | "prerequisites"
  | "stack"
  | "approach"
  | "complete";

export type MockUser = {
  id: string;
  name: string;
  slackId: string;
  team: Team;
  role: Role;
};

/** Internal tallies only — never shown as public scores in v1 UI */
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
  types: ToolType[];
  link: string;
  owner: Owner;
  team: Team;
  tags: string[];
  accessLevel: AccessLevel;
  sensitive: boolean;
  writeCapable: boolean;
  ownerInstructions: string;
  accessContact?: string;
  githubUrl?: string;
  linkUnreachable?: boolean;
  /** Lifecycle: planned → beta → live → deprecated → archived */
  status: ToolLifecycleStatus;
  approvalStatus: ApprovalStatus;
  submittedBy: string;
  usageStats: UsageStats;
  lastUpdated: string;
  lastUsed: string;
  rejectReason?: string;
  /** False when submitter names a different owner — awaiting owner ack */
  ownerConfirmed: boolean;
  /** True once an owner has claimed the listing (holds a manage key). */
  claimed?: boolean;
  chosenStack?: ChosenStack;
  chosenApproach?: ChosenApproach;
};

export type ToolFlagReasonCategory =
  | "broken-link"
  | "outdated"
  | "wrong-owner"
  | "duplicate"
  | "security"
  | "other";

export type ToolFlag = {
  id: string;
  toolId: string;
  toolName: string;
  reasonCategory: ToolFlagReasonCategory;
  note?: string;
  reporterName: string;
  reporterSlackId: string;
  createdAt: string;
};

export type ZeroResultQuery = {
  query: string;
  count: number;
};

export type ToolFormData = {
  name: string;
  oneLiner: string;
  types: ToolType[];
  link: string;
  ownerName: string;
  ownerSlackId: string;
  team: Team;
  tags: string;
  accessLevel: AccessLevel;
  sensitive: boolean;
  writeCapable: boolean;
  githubUrl: string;
  description: string;
  ownerInstructions: string;
  status: ToolLifecycleStatus;
};

export type AskToolResult = {
  type: "tools";
  query: string;
  tools: Tool[];
};

export type AskFallbackResult = {
  type: "fallback";
  query: string;
  message: string;
  reason: "gibberish" | "no-match";
};

export type Kit = {
  id: string;
  name: string;
  description: string;
  toolIds: string[];
  accentVar: string;
};

export type AskResult = AskToolResult | AskFallbackResult;

export const TOOL_TYPES: ToolType[] = [
  "app",
  "skill",
  "docs",
  "mcp",
  "plugin",
  "script",
  "slack-bot",
  "zep",
];

export type CatalogueCategory = {
  label: string;
  href: string;
  type?: ToolType;
  tab?: "blocks";
};

/** Browse catalogue subcategories — surfaced in sidebar nav and registry deep links. */
export const CATALOGUE_CATEGORIES: CatalogueCategory[] = [
  { label: "All tools", href: "/registry" },
  { label: "Apps", href: "/registry?type=app", type: "app" },
  { label: "Skills", href: "/registry?type=skill", type: "skill" },
  { label: "Docs", href: "/registry?type=docs", type: "docs" },
  { label: "MCPs", href: "/registry?type=mcp", type: "mcp" },
  { label: "Plugins", href: "/registry?type=plugin", type: "plugin" },
  { label: "Scripts", href: "/registry?type=script", type: "script" },
  { label: "Slack bots", href: "/registry?type=slack-bot", type: "slack-bot" },
  { label: "Zeps", href: "/registry?type=zep", type: "zep" },
  {
    label: "Building blocks",
    href: "/registry?tab=blocks",
    tab: "blocks",
  },
];

/** Legacy URLs may still pass `dashboard` — treat as app. */
export function normalizeCatalogueTypeParam(value: string): ToolType | "" {
  const normalized = value === "dashboard" ? "app" : value;
  return TOOL_TYPES.includes(normalized as ToolType)
    ? (normalized as ToolType)
    : "";
}

export const TEAMS: Team[] = [
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
];

export const LIFECYCLE_STATUSES: ToolLifecycleStatus[] = [
  "live",
  "beta",
  "planned",
  "deprecated",
  "archived",
];

/** Statuses a submitter can pick when registering something new */
export const SUBMIT_LIFECYCLE_STATUSES: ToolLifecycleStatus[] = [
  "planned",
  "live",
  "beta",
];

export const ROLE_LABELS: Record<Role, string> = {
  member: "Member",
  admin: "Admin",
};

export function formatBuildPath(path: BuildPath): string {
  switch (path) {
    case "claude-skill":
      return "Claude skill";
    case "claude-skill-mcp":
      return "Claude skill / MCP";
    case "replit":
      return "Replit prototype";
    case "claude-code":
      return "Claude Code";
    case "real-app":
      return "Production app";
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

export function formatBuildingBlockKind(kind: BuildingBlockKind): string {
  switch (kind) {
    case "api":
      return "API";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

export function formatToolType(type: ToolType): string {
  switch (type) {
    case "slack-bot":
      return "Slack bot";
    case "mcp":
      return "MCP";
    case "zep":
      return "Zep";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export function formatToolTypes(types: ToolType[]): string {
  return types.map(formatToolType).join(", ");
}

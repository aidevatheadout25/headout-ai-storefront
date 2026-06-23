export type Role = "admin" | "builder" | "viewer";

export type ToolType =
  | "app"
  | "skill"
  | "mcp"
  | "plugin"
  | "script"
  | "slack-bot"
  | "dashboard";

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

export type RequestStatus = "open" | "claimed" | "fulfilled" | "parked";

export type StakesLevel = "low" | "high";

export type RequestPrerequisites = {
  dataSources: string;
  systems: string;
  inputsOutputs: string;
  touchesPII: boolean;
  touchesPayments: boolean;
  usesLLM: boolean;
  needsExternalDep: boolean;
};

export type RequestValidation = {
  problem: string;
  whoHasIt: string;
  frequency: string;
  currentWorkaround: string;
  expectedValue: string;
};

export type NeedRequest = {
  id: string;
  title: string;
  problem: string;
  requestedBy: Owner;
  requestedById: string;
  team: Team;
  tags: string[];
  upvotes: number;
  upvotedBy: string[];
  status: RequestStatus;
  claimedBy?: Owner;
  claimedById?: string;
  linkedToolId?: string;
  createdAt: string;
  prerequisites?: RequestPrerequisites;
  validation?: RequestValidation;
  stakesLevel?: StakesLevel;
  funnelValidated?: boolean;
  parkedReason?: string;
  sourceQuery?: string;
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

export type FunnelStage = "prerequisites" | "validate" | "stack" | "approach" | "complete";

export type ParkedNeed = {
  id: string;
  title: string;
  reason: string;
  sourceQuery?: string;
  createdAt: string;
};

export type RequestFormData = {
  title: string;
  problem: string;
  team: Team;
  tags: string;
};

export type MockUser = {
  id: string;
  name: string;
  slackId: string;
  team: Team;
  role: Role;
};

export type BuilderAccessRequest = {
  id: string;
  userId: string;
  userName: string;
  userSlackId: string;
  team: Team;
  createdAt: string;
};

export type RequestBoardSort = "demand" | "recent";

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
  chosenStack?: ChosenStack;
  chosenApproach?: ChosenApproach;
  linkedRequestId?: string;
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
  admin: "Admin",
  builder: "Builder",
  viewer: "Viewer",
};

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
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export function formatToolTypes(types: ToolType[]): string {
  return types.map(formatToolType).join(", ");
}

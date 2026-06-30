import { DEMO_USER } from "@/lib/mockData";
import { isZepsUrl } from "@/lib/zeps";
import {
  SUBMIT_LIFECYCLE_STATUSES,
  TEAMS,
  TOOL_TYPES,
  formatToolType,
  type AccessLevel,
  type Team,
  type ToolFormData,
  type ToolLifecycleStatus,
  type ToolType,
} from "@/lib/types";

export const REGISTER_CHAT_OPENING =
  "Let's get your tool listed. What does it do, in a sentence or two?";

export const REGISTER_ENTRY_FORK_MESSAGE =
  "What are you registering today? Pick the closest match — we'll take it from there.";

export const ENTRY_FORK_CHIPS = [
  "I built a Zep",
  "I built another tool",
  "I want to build something new",
] as const;

export type EntryForkChip = (typeof ENTRY_FORK_CHIPS)[number];

export function isEntryForkChip(text: string): text is EntryForkChip {
  return (ENTRY_FORK_CHIPS as readonly string[]).includes(text);
}

export type RegisterChatField =
  | "name"
  | "oneLiner"
  | "types"
  | "status"
  | "team"
  | "accessLevel"
  | "link"
  | "githubUrl"
  | "tags"
  | "description"
  | "ownerInstructions";

export const PREVIEW_FIELDS: RegisterChatField[] = [
  "name",
  "oneLiner",
  "types",
  "status",
  "team",
  "link",
  "githubUrl",
  "accessLevel",
  "tags",
  "description",
  "ownerInstructions",
];

const TYPE_KEYWORDS: Record<ToolType, string[]> = {
  app: ["app", "dashboard", "web app", "internal app", "looker"],
  skill: ["skill", "claude skill", "claude code skill"],
  docs: ["docs", "documentation", "runbook", "guide", "notion"],
  mcp: ["mcp", "model context protocol"],
  plugin: ["plugin", "middleware", "extension"],
  script: ["script", "cli", "cron", "scraper", "python script"],
  "slack-bot": ["slack bot", "slack-bot", "slackbot"],
  zep: ["zep", "zeps", "zeps agent"],
};

export function emptyRegisterForm(): ToolFormData {
  return {
    name: "",
    oneLiner: "",
    types: [],
    link: "",
    ownerName: DEMO_USER.name,
    ownerSlackId: DEMO_USER.slackId,
    team: DEMO_USER.team,
    tags: "",
    accessLevel: "open",
    sensitive: false,
    writeCapable: false,
    githubUrl: "",
    description: "",
    ownerInstructions: "",
    status: "live",
  };
}

export function getRequiredFields(record: ToolFormData): RegisterChatField[] {
  const base: RegisterChatField[] = [
    "oneLiner",
    "name",
    "types",
    "status",
    "team",
    "accessLevel",
  ];
  if (record.status !== "planned") base.push("link");
  return base;
}

export function isRegisterFieldFilled(
  record: ToolFormData,
  field: RegisterChatField,
): boolean {
  switch (field) {
    case "types":
      return record.types.length > 0;
    case "tags":
    case "description":
    case "ownerInstructions":
    case "githubUrl":
      return Boolean(record[field]?.trim());
    default:
      return Boolean(record[field]?.toString().trim());
  }
}

export function isRegisterComplete(record: ToolFormData): boolean {
  return getRequiredFields(record).every((f) => isRegisterFieldFilled(record, f));
}

export function nextMissingField(record: ToolFormData): RegisterChatField | null {
  return getRequiredFields(record).find((f) => !isRegisterFieldFilled(record, f)) ?? null;
}

export function countRequiredFilled(record: ToolFormData): number {
  return getRequiredFields(record).filter((f) => isRegisterFieldFilled(record, f)).length;
}

const FIELD_QUESTIONS: Record<RegisterChatField, string> = {
  oneLiner: "What does it do, in a sentence or two?",
  name: "What should we call this tool?",
  types: "What type is it — app, skill, MCP, script, plugin, docs, or Slack bot?",
  status: "How far along is it — planned idea, live, or beta?",
  team: "Which team owns it — Platform, Applied AI, Supply Ops, Growth, or Content?",
  link: "What's the link to use it? (URL where people open or run it)",
  githubUrl: "Any GitHub repo URL? (say skip if not applicable)",
  accessLevel:
    "Who can access it — open to everyone, request access from you, or sensitive/restricted?",
  tags: "A few tags for search? (comma-separated, e.g. viator, supply-ops — or say skip)",
  description:
    "Want a longer description for the listing page? (or say skip — we'll use the one-liner)",
  ownerInstructions:
    "How should people get access or use it? (e.g. DM @you in #channel — or say skip)",
};

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s,)>\]"']+/i);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

function extractName(text: string): string | null {
  const patterns = [
    /(?:actually|change|update|rename|correct).{0,30}(?:name(?:\s+is)?|called|named)\s+["']?([^"'\n,.—]+?)["']?(?:\.|,|$)/i,
    /(?:it's|its|it is|tool is)\s+called\s+["']?([^"'\n,.—]+?)["']?(?:\s*[—–-]|\s+(?:a|an)\s+|\.|,|$)/i,
    /(?:called|named)\s+["']([^"']+)["']/i,
    /(?:called|named)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,4})(?=\s*(?:[.—–]|-)|$)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractOneLiner(text: string, record: ToolFormData): string | null {
  const correction = text.match(
    /(?:actually|change|update).{0,20}(?:one-?liner|tagline)(?:\s+is)?\s+["']?([^"'\n]+?)["']?(?:\.|$)/i,
  );
  if (correction) return correction[1].trim();

  const afterCalled = text.match(
    /(?:called|named)\s+[^.]+?[—–-]\s*(.+?)(?:\.\s*(?:It's|It is|Type|Status|Link|Team|Auth)|\s+https?:\/\/|$)/i,
  );
  if (afterCalled) return afterCalled[1].trim();

  const hasStructured =
    extractUrl(text) ||
    extractName(text) ||
    extractType(text) ||
    extractStatus(text) ||
    extractTeam(text) ||
    extractAccessLevel(text);

  if (text.length >= 12 && !hasStructured && !record.oneLiner) return text.trim();
  if (text.length >= 20 && !hasStructured) return text.trim();
  if (text.length >= 35 && !record.oneLiner && !hasStructured) return text.trim();
  return null;
}

function extractType(text: string): ToolType | null {
  const lower = text.toLowerCase();
  for (const type of TOOL_TYPES) {
    if (new RegExp(`\\b${type.replace("-", "[-\\s]?")}\\b`, "i").test(lower)) {
      return type;
    }
  }
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as [ToolType, string[]][]) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return null;
}

function extractStatus(text: string): ToolLifecycleStatus | null {
  const lower = text.toLowerCase();
  if (/\b(planned|idea|not built|upcoming)\b/.test(lower)) return "planned";
  if (/\b(beta|pilot|early)\b/.test(lower)) return "beta";
  if (/\b(live|shipped|production|ready)\b/.test(lower)) return "live";
  return null;
}

function extractTeam(text: string): Team | null {
  for (const team of TEAMS) {
    if (new RegExp(`\\b${team.replace(" ", "\\s+")}\\b`, "i").test(text)) return team;
  }
  return null;
}

function extractAccessLevel(text: string): AccessLevel | null {
  const lower = text.toLowerCase();
  if (/\b(sensitive|restricted|logged access)\b/.test(lower)) return "sensitive";
  if (/\b(request|ask owner|contact owner|dm owner)\b/.test(lower)) return "request";
  if (/\b(open|everyone|anyone|public)\b/.test(lower)) return "open";
  return null;
}

function extractTags(text: string): string | null {
  if (/^(skip|no|none|n\/a)$/i.test(text.trim())) return null;
  const explicit = text.match(/tags?\s*:?\s*([^.]+)/i);
  if (explicit) return explicit[1].trim();
  const kebabList = text.match(/(?:^|[\s,])([a-z][a-z0-9]*(?:-[a-z0-9]+)+(?:\s*,\s*[a-z][a-z0-9]*(?:-[a-z0-9]+)+)*)/i);
  if (kebabList && text.includes(",")) return kebabList[1].trim();
  return null;
}

function extractCorrections(text: string): Partial<ToolFormData> {
  const updates: Partial<ToolFormData> = {};

  const linkFix = text.match(
    /(?:actually|change|update).{0,25}link(?:\s+is|\s+to)\s+(https?:\/\/[^\s]+)/i,
  );
  if (linkFix) updates.link = linkFix[1].replace(/[.,;]+$/, "");

  const statusFix = text.match(
    /(?:actually|change|update).{0,25}status(?:\s+is|\s+to)\s+(planned|live|beta)/i,
  );
  if (statusFix) updates.status = statusFix[1].toLowerCase() as ToolLifecycleStatus;

  const teamFix = text.match(
    /(?:actually|change|update).{0,25}team(?:\s+is|\s+to)\s+(Platform|Applied AI|Supply Ops|Growth|Content)/i,
  );
  if (teamFix) updates.team = teamFix[1] as Team;

  return updates;
}

export type ExtractResult = {
  updates: Partial<ToolFormData>;
  confirmations: string[];
};

function confirmationForUpdates(updates: Partial<ToolFormData>): string[] {
  const confirmations: string[] = [];
  if (updates.name) confirmations.push(`name set to "${updates.name}"`);
  if (updates.oneLiner) confirmations.push("one-liner captured");
  if (updates.types?.length)
    confirmations.push(`type set to ${formatToolType(updates.types[0])}`);
  if (updates.status) confirmations.push(`status set to ${updates.status}`);
  if (updates.team) confirmations.push(`team set to ${updates.team}`);
  if (updates.accessLevel) confirmations.push(`access set to ${updates.accessLevel}`);
  if (updates.link) confirmations.push(`link set to ${updates.link}`);
  if (updates.githubUrl) confirmations.push(`GitHub URL set to ${updates.githubUrl}`);
  if (updates.tags) confirmations.push(`tags set to ${updates.tags}`);
  if (updates.description) confirmations.push("description captured");
  if (updates.ownerInstructions) confirmations.push("owner instructions captured");
  return confirmations;
}

/** Plain answer for the field the agent just asked about. */
function directFieldUpdate(
  text: string,
  field: RegisterChatField,
  record: ToolFormData,
): Partial<ToolFormData> | null {
  const trimmed = text.trim();
  if (!trimmed || /^skip$/i.test(trimmed)) return null;

  switch (field) {
    case "name": {
      if (trimmed.length < 2 || trimmed.length > 80 || extractUrl(text)) return null;
      const cleaned = trimmed.replace(/^["']|["']$/g, "");
      if (record.name === cleaned) return null;
      return { name: cleaned };
    }
    case "oneLiner": {
      if (trimmed.length < 8 || extractUrl(text)) return null;
      if (record.oneLiner === trimmed) return null;
      return { oneLiner: trimmed };
    }
    case "types": {
      const type = extractType(text);
      if (!type || record.types.includes(type)) return null;
      return { types: [type] };
    }
    case "status": {
      const status = extractStatus(text);
      if (!status || record.status === status) return null;
      return { status };
    }
    case "team": {
      const team = extractTeam(text);
      if (!team || record.team === team) return null;
      return { team };
    }
    case "accessLevel": {
      const accessLevel = extractAccessLevel(text);
      if (!accessLevel || record.accessLevel === accessLevel) return null;
      const patch: Partial<ToolFormData> = { accessLevel };
      if (accessLevel === "sensitive") patch.sensitive = true;
      return patch;
    }
    case "link": {
      if (/skip/i.test(trimmed) && record.status === "planned") return null;
      const url = extractUrl(text);
      if (!url || record.link === url) return null;
      return { link: url };
    }
    default:
      return null;
  }
}

export function extractFromMessage(
  text: string,
  record: ToolFormData,
  expectingField: RegisterChatField | null = null,
): ExtractResult {
  const updates: Partial<ToolFormData> = { ...extractCorrections(text) };
  const confirmations: string[] = [];

  const url = extractUrl(text);
  if (url) {
    if (/github\.com/i.test(url)) {
      if (url !== record.githubUrl) {
        updates.githubUrl = url;
        confirmations.push(`GitHub URL set to ${url}`);
      }
    } else if (isZepsUrl(url)) {
      // Publish-back: a Zeps link means this is a built agent. Mark it a live Zep.
      if (url !== record.link) {
        updates.link = url;
        confirmations.push(`Zeps agent linked — runs caller-bound at ${url}`);
      }
      if (!record.types.includes("zep")) {
        updates.types = ["zep"];
        confirmations.push("type set to Zep");
      }
      if (record.status === "planned") {
        updates.status = "live";
        confirmations.push("status set to live");
      }
    } else if (url !== record.link) {
      updates.link = url;
      confirmations.push(`link set to ${url}`);
    }
  }

  const name = extractName(text);
  if (name && name !== record.name) {
    updates.name = name;
    confirmations.push(`name set to "${name}"`);
  }

  const oneLiner = extractOneLiner(text, record);
  if (oneLiner && oneLiner !== record.oneLiner) {
    updates.oneLiner = oneLiner;
    confirmations.push("one-liner captured");
  }

  const type = extractType(text);
  if (type && !record.types.includes(type)) {
    updates.types = [type];
    confirmations.push(`type set to ${formatToolType(type)}`);
  }

  const status = extractStatus(text);
  if (status && status !== record.status) {
    updates.status = status;
    confirmations.push(`status set to ${status}`);
  }

  const team = extractTeam(text);
  if (team && team !== record.team) {
    updates.team = team;
    confirmations.push(`team set to ${team}`);
  }

  const accessLevel = extractAccessLevel(text);
  if (accessLevel && accessLevel !== record.accessLevel) {
    updates.accessLevel = accessLevel;
    if (accessLevel === "sensitive") updates.sensitive = true;
    confirmations.push(`access set to ${accessLevel}`);
  }

  const tags = extractTags(text);
  if (tags && tags !== record.tags) {
    updates.tags = tags;
    confirmations.push(`tags set to ${tags}`);
  }

  if (
    text.length > 80 &&
    !record.description &&
    !updates.oneLiner &&
    confirmations.length === 0
  ) {
    updates.description = text.trim();
    confirmations.push("description captured");
  }

  const instructions = text.match(
    /(?:instructions?|access|how to (?:use|get access))\s*:?\s*(.+)/i,
  );
  if (instructions && instructions[1].length > 10) {
    updates.ownerInstructions = instructions[1].trim();
    confirmations.push("owner instructions captured");
  }

  const merged = { ...record, ...updates };

  if (expectingField && !isRegisterFieldFilled(merged, expectingField)) {
    const direct = directFieldUpdate(text, expectingField, record);
    if (direct) {
      Object.assign(updates, direct);
      confirmations.push(...confirmationForUpdates(direct));
    }
  }

  return { updates, confirmations };
}

export function buildAgentReply(
  record: ToolFormData,
  confirmations: string[],
): string {
  const parts: string[] = [];

  if (confirmations.length) {
    parts.push(confirmations.map((c) => `Got it — ${c} ✅`).join("\n"));
  }

  if (isRegisterComplete(record)) {
    parts.push(
      `Here's what I have:\n• **${record.name}** — ${record.oneLiner}\n• ${formatToolType(record.types[0])} · ${record.status} · ${record.team}\n• Access: ${record.accessLevel}${record.link ? `\n• Link: ${record.link}` : ""}${record.githubUrl ? `\n• GitHub: ${record.githubUrl}` : ""}\n\nLooks complete — hit **Register** when you're ready.`,
    );
    return parts.join("\n\n");
  }

  const missing = nextMissingField(record);
  if (missing) {
    parts.push(FIELD_QUESTIONS[missing]);
  }

  return parts.join("\n\n") || REGISTER_CHAT_OPENING;
}

export function getQuickReplies(
  lastAgentText: string,
  record: ToolFormData,
): string[] {
  if (lastAgentText.includes("What are you registering")) {
    return [...ENTRY_FORK_CHIPS];
  }
  if (lastAgentText.includes("What should we call")) {
    return [];
  }
  if (lastAgentText.includes("What does it do")) {
    return [];
  }
  if (lastAgentText.includes("authenticate") || lastAgentText.includes("Who can access")) {
    return ["Open to everyone", "Request access", "Sensitive / restricted"];
  }
  if (lastAgentText.includes("type is it")) {
    return TOOL_TYPES.map(formatToolType);
  }
  if (lastAgentText.includes("How far along")) {
    return SUBMIT_LIFECYCLE_STATUSES.map((s) =>
      s === "planned" ? "Planned idea" : s.charAt(0).toUpperCase() + s.slice(1),
    );
  }
  if (lastAgentText.includes("Which team")) {
    return [...TEAMS];
  }
  if (lastAgentText.includes("tags for search")) {
    return ["skip"];
  }
  if (lastAgentText.includes("longer description")) {
    return ["skip"];
  }
  if (lastAgentText.includes("GitHub repo")) {
    return ["skip"];
  }
  if (lastAgentText.includes("get access or use it")) {
    return ["Ping me on Slack with your use case", "skip"];
  }
  if (lastAgentText.includes("link to use it") && record.status === "planned") {
    return ["skip — no link yet"];
  }
  return [];
}

export function fieldLabel(field: RegisterChatField): string {
  switch (field) {
    case "oneLiner":
      return "One-liner";
    case "githubUrl":
      return "GitHub URL";
    case "ownerInstructions":
      return "How to access";
    default:
      return field.charAt(0).toUpperCase() + field.slice(1);
  }
}

export function fieldDisplayValue(
  record: ToolFormData,
  field: RegisterChatField,
): string {
  switch (field) {
    case "types":
      return record.types.map(formatToolType).join(", ");
    default:
      return record[field]?.toString() ?? "";
  }
}

export function openingMessage(prefill?: Partial<ToolFormData>): string {
  if (prefill?.name && prefill?.oneLiner) {
    return `I see you're registering **${prefill.name}**. ${FIELD_QUESTIONS.types}`;
  }
  if (prefill?.oneLiner) {
    return `Got the one-liner. ${FIELD_QUESTIONS.name}`;
  }
  if (prefill?.name) {
    return `I see you're registering **${prefill.name}**. ${FIELD_QUESTIONS.oneLiner}`;
  }
  return REGISTER_ENTRY_FORK_MESSAGE;
}

export function buildZepReviewAgentMessage(): string {
  return (
    "I drafted the listing — check the summary on the right. Two things I need you to confirm: who can access it, and the owning team.\n\n" +
    FIELD_QUESTIONS.accessLevel
  );
}

export const BUILD_NEW_ZEPS_MESSAGE =
  "Building happens in Zeps — a conversational builder, not this form. Open it in a new tab when you're ready; come back here to register the link when it's done.";

export function applyZepAnalysisDraft(
  record: ToolFormData,
  draft: Partial<ToolFormData>,
): ToolFormData {
  return {
    ...record,
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.oneLiner ? { oneLiner: draft.oneLiner } : {}),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.types?.length ? { types: draft.types } : {}),
    ...(draft.tags ? { tags: draft.tags } : {}),
    ...(draft.team ? { team: draft.team } : {}),
    ...(draft.link ? { link: draft.link } : {}),
    status: "live",
  };
}

export function flashFieldsFromDraft(
  draft: Partial<ToolFormData>,
): RegisterChatField[] {
  const fields: RegisterChatField[] = ["status"];
  if (draft.name) fields.push("name");
  if (draft.oneLiner) fields.push("oneLiner");
  if (draft.description) fields.push("description");
  if (draft.types?.length) fields.push("types");
  if (draft.tags) fields.push("tags");
  if (draft.team) fields.push("team");
  if (draft.link) fields.push("link");
  return fields;
}

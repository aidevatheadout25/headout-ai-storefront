import type { Tool } from "@/lib/types";

/**
 * The catalogue is served by the Express api-server at `/api`.
 * Production: same origin (Express serves the SPA + API).
 * Local Vite: `server.proxy` forwards `/api` to the API server.
 */
const API_BASE = "/api";

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

/** The single best-fit builder the concierge hands a scoped need off to. */
export type BuilderId =
  | "manual"
  | "claude-skill"
  | "replit"
  | "claude-code"
  | "zeps"
  | "real-app";

/** Build-gate funnel stage. */
export type FunnelStage =
  | "chat"
  | "handoff"
  | "register"
  | "scope"
  | "scope_exit"
  | "brief"
  | "kill"
  | "escalate"
  | "disambiguation";

/**
 * The shape a build should take — see chatAgent.ts's Modality type (the
 * server-side source of truth; this is a plain mirror, this repo has no
 * shared type package between the two).
 */
export type Modality =
  | "no_build"
  | "skill"
  | "mcp"
  | "zep"
  | "script"
  | "micro_app"
  | "full_app"
  | "eng_project";

export type BriefPayload = {
  conversationId?: string;
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] };
  title?: string;
  problem: string;
  users: string;
  frequency: string;
  mustDo: string[];
  wontDo: string[];
  modality: Modality;
  modalityReason: string;
  risk: "low" | "high";
};

export type KillPayload = {
  modality: "no_build";
  reason: string;
  alternative: string;
  alternativeUrl?: string;
};

/** Produced by escalate_to_eng: a short project pitch instead of a self-serve repo. */
export type EscalatePayload = {
  modality: "eng_project";
  problem: string;
  whyLoadBearing: string;
  suggestedOwningTeams: string;
  roughShape: string;
};

export type ChatResult = {
  message: string;
  tools: Tool[];
  noMatch: boolean;
  stage: FunnelStage;
  recommendedBuilder: BuilderId | null;
  buildPrompt: string | null;
  /** Set only when stage === "register": the captured URL, or null if not yet provided. */
  registration: { url: string | null } | null;
  /** Set when stage === "brief": the full requirements brief from the critique agent. */
  briefPayload: BriefPayload | null;
  /** Set when stage === "kill": the kill recommendation from the critique agent. */
  killPayload: KillPayload | null;
  /** Set when stage === "escalate": the project pitch from the critique agent. */
  escalatePayload: EscalatePayload | null;
  /** Set when stage === "scope_exit" and the user's exit message had an
   *  actionable request (e.g. "show me the registry instead") — forward it
   *  as a new search rather than dead-ending on the acknowledgement. */
  forwardQuery: string | null;
  conversationId: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedMessage = {
  id: string;
  role: ChatRole;
  text: string;
  tools: Tool[] | null;
  noMatch: boolean;
  stage: FunnelStage;
  recommendedBuilder: BuilderId | null;
  buildPrompt: string | null;
  /** Set only when stage === "register": the captured URL, or null if not yet provided. */
  registration: { url: string | null } | null;
  briefPayload: BriefPayload | null;
  killPayload: KillPayload | null;
  escalatePayload: EscalatePayload | null;
  userQuery: string | null;
  createdAt: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function mutateJson<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore parse failures, keep the status message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return mutateJson<T>(path, "POST", body);
}

export async function fetchTools(type?: string): Promise<Tool[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const data = await getJson<{ tools: Tool[] }>(`/tools${query}`);
  return data.tools;
}

/**
 * Returns the tool, or `null` only when it genuinely does not exist (404).
 * Transient/server errors are rethrown so the caller can show a retryable
 * error state instead of a misleading "not found".
 */
export async function fetchTool(id: string): Promise<Tool | null> {
  try {
    const data = await getJson<{ tool: Tool }>(`/tools/${encodeURIComponent(id)}`);
    return data.tool;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export type SendChatOpts = {
  mode?: "scope";
  searchContext?: { query: string; nearMisses: { name: string; oneLiner: string }[] };
};

export async function sendChat(
  messages: ChatTurn[],
  conversationId?: string | null,
  opts?: SendChatOpts,
): Promise<ChatResult> {
  return postJson<ChatResult>("/chat", {
    messages,
    ...(conversationId ? { conversationId } : {}),
    ...(opts?.mode ? { mode: opts.mode } : {}),
    ...(opts?.searchContext ? { searchContext: opts.searchContext } : {}),
  });
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const data = await getJson<{ conversations: ConversationSummary[] }>(
    "/conversations",
  );
  return data.conversations;
}

export async function fetchConversation(
  id: string,
): Promise<{ conversation: ConversationSummary; messages: SavedMessage[] }> {
  return getJson<{ conversation: ConversationSummary; messages: SavedMessage[] }>(
    `/conversations/${encodeURIComponent(id)}`,
  );
}

/** Editable metadata the LLM inferred for a pasted URL. */
export type ToolPreview = {
  type: string;
  title: string;
  oneLiner: string;
  description: string;
  tags: string[];
  team: string;
  url: string;
};

export type InspectToolResult =
  | { duplicate: true; tool: Tool }
  | { duplicate: false; preview: ToolPreview; lowConfidence: boolean };

/**
 * Read a pasted URL and return inferred metadata for review WITHOUT saving.
 * If the URL is already catalogued, returns the existing tool as a duplicate.
 */
export async function inspectToolUrl(url: string): Promise<InspectToolResult> {
  const data = await postJson<{
    duplicate?: boolean;
    tool?: Tool;
    preview?: ToolPreview;
    lowConfidence?: boolean;
  }>("/tools/inspect", { url });
  if (data.duplicate && data.tool) {
    return { duplicate: true, tool: data.tool };
  }
  return {
    duplicate: false,
    preview: data.preview as ToolPreview,
    lowConfidence: data.lowConfidence ?? false,
  };
}

export type AddChatTurn = { role: "user" | "assistant"; content: string };

export type AddChatResult =
  | { duplicate: true; tool: Tool }
  | {
      duplicate?: false;
      ready: boolean;
      message: string;
      preview: ToolPreview;
      lowConfidence?: boolean;
    };

/**
 * Conversational add-tool flow.
 * First call: pass `{ url }` or `{ skillMarkdown }` — returns the opening
 * assistant message + inferred draft.
 * Subsequent calls: pass `{ url?, messages, preview }` — returns next question
 * or ready:true. Skills uploaded as SKILL.md may omit url.
 */
export async function addToolChat(params: {
  url?: string;
  skillMarkdown?: string;
  messages?: AddChatTurn[];
  preview?: ToolPreview;
}): Promise<AddChatResult> {
  return postJson<AddChatResult>("/tools/add-chat", params);
}

export type AddToolResult = {
  tool: Tool;
  /** True when the URL already existed and the catalogue returned that entry. */
  duplicate: boolean;
};

/** Persist a reviewed (possibly edited) tool to the catalogue. */
export async function createTool(payload: ToolPreview): Promise<AddToolResult> {
  const data = await postJson<{ tool: Tool; duplicate?: boolean }>(
    "/tools",
    payload,
  );
  return { tool: data.tool, duplicate: data.duplicate ?? false };
}

/** Credentials proving the caller may edit a tool. */
export type ManageAuth = {
  manageToken?: string;
  adminToken?: string;
};

/** The fields an owner/admin may edit on a tool. */
export type ToolPatch = {
  type?: string;
  title?: string;
  oneLiner?: string;
  description?: string;
  tags?: string[];
  ownerName?: string;
  ownerSlackId?: string;
  team?: string;
  url?: string;
  status?: string;
  accessLevel?: string;
};

function authHeaders(auth: ManageAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.manageToken) headers["x-manage-token"] = auth.manageToken;
  if (auth.adminToken) headers["x-admin-token"] = auth.adminToken;
  return headers;
}

/**
 * Claim ownership of a tool. Returns the updated tool plus a one-time manage
 * key that must be saved to make future edits. Reassigning an already-claimed
 * tool requires an admin key.
 */
export async function claimTool(
  id: string,
  owner: { ownerName: string; ownerSlackId: string },
  adminToken?: string,
): Promise<{ tool: Tool; manageToken: string }> {
  return mutateJson<{ tool: Tool; manageToken: string }>(
    `/tools/${encodeURIComponent(id)}/claim`,
    "POST",
    owner,
    adminToken ? { "x-admin-token": adminToken } : {},
  );
}

/** Apply an owner/admin edit to a tool. */
export async function updateTool(
  id: string,
  patch: ToolPatch,
  auth: ManageAuth,
): Promise<Tool> {
  const data = await mutateJson<{ tool: Tool }>(
    `/tools/${encodeURIComponent(id)}`,
    "PATCH",
    patch,
    authHeaders(auth),
  );
  return data.tool;
}

// ─── Builder journey ──────────────────────────────────────────────────────────

/** Persist a draft brief from the critique agent. Returns the saved brief row. */
export async function createBrief(
  brief: BriefPayload,
): Promise<{ brief: { id: string } & BriefPayload }> {
  return postJson("/briefs", brief);
}

/** Partially update a brief (user edits the brief card). */
export async function updateBrief(
  id: string,
  patch: Partial<BriefPayload>,
): Promise<{ brief: { id: string } & BriefPayload }> {
  return mutateJson(`/briefs/${encodeURIComponent(id)}`, "PATCH", patch);
}

export type ScaffoldResult = {
  repoUrl: string;
  contents: string[];
  briefId: string;
  buildId: string;
};

/** Simulate repo scaffolding from a confirmed brief. */
export async function scaffoldRepo(briefId: string): Promise<ScaffoldResult> {
  return postJson("/scaffold", { briefId });
}

/** Verify a checklist step for a build. */
export async function verifyStep(
  buildId: string,
  step: 0 | 1 | 2 | 3,
): Promise<{ ok: boolean }> {
  return postJson(`/builds/${encodeURIComponent(buildId)}/verify-step`, { step });
}

export type ReviewEvent = { stage: string; label: string; ok: boolean };

export type ReviewResult = {
  events: ReviewEvent[];
  toolId: string;
  toolName: string;
  toolSlug: string;
};

/** Run the simulated review sequence and insert the tool into the catalogue. */
export async function submitReview(buildId: string): Promise<ReviewResult> {
  return postJson(`/builds/${encodeURIComponent(buildId)}/submit-review`, {});
}

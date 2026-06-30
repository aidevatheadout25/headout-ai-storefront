import type { Tool } from "@/lib/types";

/**
 * The catalogue is served by the Express api-server, mounted at `/api` on the
 * platform proxy (same origin as the storefront). All catalogue reads/writes go
 * through here — the DB is the single source of truth.
 */
const API_BASE = "/api";

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ChatResult = {
  message: string;
  tools: Tool[];
  noMatch: boolean;
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

export async function sendChat(
  messages: ChatTurn[],
  conversationId?: string | null,
): Promise<ChatResult> {
  return postJson<ChatResult>("/chat", {
    messages,
    ...(conversationId ? { conversationId } : {}),
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

export async function addToolByUrl(url: string): Promise<Tool> {
  const data = await postJson<{ tool: Tool }>("/tools", { url });
  return data.tool;
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

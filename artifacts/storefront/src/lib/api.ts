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
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    throw new Error(message);
  }
  return (await res.json()) as T;
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

export async function sendChat(messages: ChatTurn[]): Promise<ChatResult> {
  return postJson<ChatResult>("/chat", { messages });
}

export async function addToolByUrl(url: string): Promise<Tool> {
  const data = await postJson<{ tool: Tool }>("/tools", { url });
  return data.tool;
}

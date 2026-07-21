import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "./logger";

/**
 * Delphi MCP client — Headout org knowledge beyond the Storefront catalogue.
 *
 * Endpoint (streamable HTTP): https://delphi.headout.com/tools/mcp
 * Auth: Bearer token from Slack `/create-delphi-api-key` (or shared BACKEND key).
 *
 * Tools: ask, search_docs, analyze_code, classify, find_repos, fetch_page.
 * When DELPHI_API_KEY is unset, calls short-circuit as unavailable so chat
 * still works catalogue-only.
 */

export const DELPHI_TOOL_NAMES = [
  "ask",
  "search_docs",
  "analyze_code",
  "classify",
  "find_repos",
  "fetch_page",
] as const;

export type DelphiToolName = (typeof DELPHI_TOOL_NAMES)[number];

export type DelphiCallResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; unavailable?: boolean };

const DEFAULT_URL = "https://delphi.headout.com/tools/mcp";
/** Deep code analysis can be slow; keep a hard ceiling so chat doesn't hang. */
const DEFAULT_TIMEOUT_MS = 90_000;

export function isDelphiConfigured(): boolean {
  return Boolean(process.env.DELPHI_API_KEY?.trim());
}

export function getDelphiUrl(): string {
  return (process.env.DELPHI_MCP_URL?.trim() || DEFAULT_URL).replace(/\/$/, "");
}

function getApiKey(): string | null {
  const key = process.env.DELPHI_API_KEY?.trim();
  return key || null;
}

function getTimeoutMs(): number {
  const raw = process.env.DELPHI_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Test-only seam — same pattern as verifyCapability. Mutate `.impl` in tests
 * to stub Delphi without network.
 */
export const _testOverrides: {
  impl: ((tool: DelphiToolName, args: Record<string, unknown>) => Promise<DelphiCallResult>) | null;
} = { impl: null };

function textFromMcpContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const texts = content
    .filter((c): c is { type: string; text?: string } => !!c && typeof c === "object" && "type" in c)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string);
  if (texts.length === 0) return content;
  if (texts.length === 1) {
    const only = texts[0];
    try {
      return JSON.parse(only) as unknown;
    } catch {
      return only;
    }
  }
  return texts.join("\n\n");
}

/**
 * Call one Delphi MCP tool. Opens a short-lived streamable-HTTP session per
 * call (Delphi runs `stateless_http=true`).
 */
export async function callDelphiTool(
  tool: DelphiToolName,
  args: Record<string, unknown> = {},
): Promise<DelphiCallResult> {
  if (_testOverrides.impl) return _testOverrides.impl(tool, args);

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      unavailable: true,
      error: "Delphi is not configured (DELPHI_API_KEY unset). Continue with catalogue-only judgment.",
    };
  }

  const url = getDelphiUrl();
  const timeoutMs = getTimeoutMs();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let client: Client | null = null;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    });
    client = new Client({ name: "headout-ai-storefront", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({ name: tool, arguments: args });
    const data = textFromMcpContent((result as { content?: unknown }).content);

    if ((result as { isError?: boolean }).isError) {
      logger.warn({ tool, durationMs: Date.now() - started }, "delphi tool returned isError");
      return {
        ok: false,
        error: typeof data === "string" ? data : `Delphi ${tool} failed.`,
      };
    }

    logger.info({ tool, durationMs: Date.now() - started }, "delphi tool ok");
    return { ok: true, data };
  } catch (err) {
    const aborted = controller.signal.aborted;
    const message = aborted
      ? `Delphi timed out after ${timeoutMs}ms. Try a narrower question or skip Delphi this turn.`
      : err instanceof Error
        ? err.message
        : String(err);
    logger.warn({ tool, err: message, durationMs: Date.now() - started }, "delphi tool failed");
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}

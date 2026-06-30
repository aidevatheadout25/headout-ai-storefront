import { openai } from "@workspace/integrations-openai-ai-server";
import type { InsertTool } from "@workspace/db";
import { safeFetch } from "./urlGuard";

const MODEL = "gpt-5.4";

const TOOL_TYPES = [
  "app",
  "skill",
  "docs",
  "mcp",
  "plugin",
  "script",
  "slack-bot",
  "zep",
] as const;

const TEAMS = [
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
] as const;

/** Minimal mirror of the storefront's isZepsUrl — a Zeps-hosted runtime link. */
export function isZepsUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.toLowerCase().includes("zeps");
  } catch {
    return false;
  }
}

/**
 * Best-effort fetch of a page's visible text to give the model context.
 * Uses {@link safeFetch} so user-supplied URLs cannot be used for SSRF.
 */
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 8000,
      headers: { "User-Agent": "HeadoutStorefrontBot/1.0" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  } catch {
    return "";
  }
}

export type InferredTool = Omit<InsertTool, "embedding">;

const JSON_SCHEMA = {
  name: "tool_metadata",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: TOOL_TYPES },
      title: { type: "string" },
      oneLiner: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      team: { type: "string", enum: TEAMS },
    },
    required: ["type", "title", "oneLiner", "description", "tags", "team"],
  },
} as const;

/**
 * Infer catalogue metadata for a pasted URL. Fetches the page text when
 * reachable and asks the LLM to classify it; Zeps URLs are forced to `zep`.
 */
export async function inferToolFromUrl(url: string): Promise<InferredTool> {
  const zep = isZepsUrl(url);
  const pageText = await fetchPageText(url);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
    messages: [
      {
        role: "system",
        content:
          "You catalogue internal AI tools for Headout (a travel/experiences company). Given a URL and any scraped page text, infer concise, accurate registry metadata. The one-liner is a single sentence. Pick 3-6 lowercase capability tags. If unsure of the team, choose Platform.",
      },
      {
        role: "user",
        content: `URL: ${url}\n${
          zep ? "This is a Zeps-hosted agent (type must be \"zep\").\n" : ""
        }Page text (may be empty):\n${pageText || "(none)"}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    type: string;
    title: string;
    oneLiner: string;
    description: string;
    tags: string[];
    team: string;
  };

  return {
    type: zep ? "zep" : parsed.type,
    title: parsed.title,
    oneLiner: parsed.oneLiner,
    description: parsed.description,
    tags: parsed.tags ?? [],
    team: parsed.team || "Platform",
    url,
    ownerName: "",
    ownerSlackId: "",
    source: "manual",
    visibility: "org",
    status: "live",
    accessLevel: "open",
  };
}

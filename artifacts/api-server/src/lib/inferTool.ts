import { anthropic, CLAUDE_MODEL } from "./anthropicClient";
import type Anthropic from "@anthropic-ai/sdk";
import type { InsertTool } from "@workspace/db";
import { safeFetch } from "./urlGuard";
import { fetchTagVocabulary } from "./catalogue";
import { parseSkillMd, type ParsedSkillMd } from "./parseSkillMd";
import {
  MAX_TAGS,
  MIN_TAGS,
  renderTagVocabulary,
  resolveInferredTags,
  TAG_POLICY_PROMPT,
} from "./tagPolicy";

const MODEL = CLAUDE_MODEL;

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

/** Structured signals scraped from a page, used to ground the inference. */
export type PageSignals = {
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogSiteName: string;
  bodyText: string;
};

const EMPTY_SIGNALS: PageSignals = {
  title: "",
  metaDescription: "",
  ogTitle: "",
  ogDescription: "",
  ogSiteName: "",
  bodyText: "",
};

/** Decode the handful of HTML entities that show up in titles/meta content. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Pull every <meta> tag into a name/property → content map. */
function extractMetaTags(html: string): Record<string, string> {
  const metas: Record<string, string> = {};
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag
      .match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]
      ?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && content) metas[key] = decodeEntities(content);
  }
  return metas;
}

/**
 * Best-effort fetch of a page's structured signals (title, meta description,
 * OpenGraph tags) plus visible body text. Client-rendered SPAs return an empty
 * body shell, but their server-rendered <head> usually still carries a real
 * title/description — so we lean on those rather than the raw URL slug.
 * Uses {@link safeFetch} so user-supplied URLs cannot be used for SSRF.
 */
export async function fetchPageSignals(url: string): Promise<PageSignals> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 8000,
      headers: { "User-Agent": "HeadoutStorefrontBot/1.0" },
    });
    if (!res.ok) return EMPTY_SIGNALS;
    const html = await res.text();

    const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const metas = extractMetaTags(html);

    const bodyText = html
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return {
      title: decodeEntities(titleRaw.replace(/\s+/g, " ")),
      metaDescription: metas["description"] ?? "",
      ogTitle: metas["og:title"] ?? "",
      ogDescription: metas["og:description"] ?? "",
      ogSiteName: metas["og:site_name"] ?? "",
      bodyText,
    };
  } catch {
    return EMPTY_SIGNALS;
  }
}

export type InferredTool = Omit<InsertTool, "embedding">;

export type InferToolResult = {
  preview: InferredTool;
  /**
   * True when the page yielded too little real signal to classify confidently
   * (e.g. an empty client-rendered shell). The UI surfaces this so the user
   * reviews/corrects the guess instead of trusting a fabricated classification.
   */
  lowConfidence: boolean;
};

const INFER_TOOL_DEF: Anthropic.Tool = {
  name: "tool_metadata",
  description: "Extract structured catalogue metadata for an internal Headout AI tool.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: TOOL_TYPES as unknown as string[] },
      title: { type: "string" },
      oneLiner: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      team: { type: "string", enum: TEAMS as unknown as string[] },
      lowConfidence: { type: "boolean" },
    },
    required: ["type", "title", "oneLiner", "description", "tags", "team", "lowConfidence"],
  },
};

/** Heuristic: did the page give us anything real to classify from? */
function hasUsableSignal(signals: PageSignals): boolean {
  const headSignal = [
    signals.title,
    signals.metaDescription,
    signals.ogTitle,
    signals.ogDescription,
    signals.ogSiteName,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return headSignal.length >= 15 || signals.bodyText.length >= 200;
}

function renderSignals(signals: PageSignals): string {
  const lines = [
    signals.title && `Title: ${signals.title}`,
    signals.ogTitle && `OG title: ${signals.ogTitle}`,
    signals.ogSiteName && `Site name: ${signals.ogSiteName}`,
    signals.metaDescription && `Meta description: ${signals.metaDescription}`,
    signals.ogDescription && `OG description: ${signals.ogDescription}`,
    signals.bodyText && `Visible text: ${signals.bodyText}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "(no readable page signals)";
}

/**
 * Infer catalogue metadata for a pasted URL. Fetches the page's structured
 * signals when reachable and asks the LLM to classify *from those signals* —
 * not from the URL slug. Zeps URLs are forced to `zep`. Returns the inferred
 * metadata plus a low-confidence flag so the caller can prompt for review
 * rather than silently committing a guess.
 */
export async function inferToolFromUrl(url: string): Promise<InferToolResult> {
  const zep = isZepsUrl(url);
  const [signals, vocabulary] = await Promise.all([
    fetchPageSignals(url),
    fetchTagVocabulary(),
  ]);
  const usableSignal = hasUsableSignal(signals);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [INFER_TOOL_DEF],
    tool_choice: { type: "tool", name: "tool_metadata" },
    system:
      "You catalogue internal AI tools for Headout (a travel/experiences company). " +
      "Classify the tool ONLY from the supplied page signals (title, meta/OpenGraph " +
      "description, site name, and visible text). Do NOT infer what the tool does from " +
      "the URL, its slug, or its path — if the signals do not state what it does, do not " +
      "invent specifics. The one-liner is one factual sentence grounded in the signals. " +
      "If unsure of the team, choose Platform. " +
      "Set lowConfidence to true whenever the signals are too thin to classify confidently " +
      "(for example an almost-empty client-rendered page). When lowConfidence is true, give a " +
      "minimal best-effort guess from the title/site name and keep the description short and " +
      "generic rather than fabricating capabilities.\n\n" +
      TAG_POLICY_PROMPT,
    messages: [
      {
        role: "user",
        content: `URL: ${url}\n${
          zep ? 'This is a Zeps-hosted agent (type must be "zep").\n' : ""
        }${
          usableSignal
            ? ""
            : "NOTE: the page returned almost no readable content. Treat this as low confidence.\n"
        }Existing catalogue tags (reuse these before inventing new ones): ${renderTagVocabulary(
          vocabulary,
        )}\nPage signals:\n${renderSignals(signals)}`,
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tool_metadata",
  );

  const parsed = (toolBlock?.input ?? {}) as {
    type?: string;
    title?: string;
    oneLiner?: string;
    description?: string;
    tags?: string[];
    team?: string;
    lowConfidence?: boolean;
  };

  const { tags, belowMin } = await resolveInferredTags(parsed.tags ?? [], () =>
    regenerateTags(url, parsed as { title: string; oneLiner: string; description: string }, signals, vocabulary),
  );

  const preview: InferredTool = {
    type: zep ? "zep" : (parsed.type as InferredTool["type"] ?? "app"),
    title: parsed.title ?? "",
    oneLiner: parsed.oneLiner ?? "",
    description: parsed.description ?? "",
    tags,
    team: parsed.team ?? "Platform",
    url,
    ownerName: "",
    ownerSlackId: "",
    verified: false,
    source: "manual",
    visibility: "org",
    status: "live",
    accessLevel: "open",
  };

  return {
    preview,
    lowConfidence: !usableSignal || (parsed.lowConfidence ?? false) || belowMin,
  };
}

/**
 * Infer catalogue metadata from an uploaded SKILL.md. Frontmatter supplies
 * name/description; the LLM fills team/tags/one-liner and keeps type pinned
 * to `skill`. No URL is required — skills often live only in a local agents
 * folder until someone PRs them into HeadoutAgentsConfig.
 */
export async function inferToolFromSkillMarkdown(
  markdown: string,
  opts?: { url?: string },
): Promise<InferToolResult> {
  const skill = parseSkillMd(markdown);
  return inferToolFromParsedSkill(skill, opts?.url?.trim() ?? "");
}

async function inferToolFromParsedSkill(
  skill: ParsedSkillMd,
  url: string,
): Promise<InferToolResult> {
  const vocabulary = await fetchTagVocabulary();
  const bodyExcerpt = skill.body.slice(0, 6000);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [INFER_TOOL_DEF],
    tool_choice: { type: "tool", name: "tool_metadata" },
    system:
      "You catalogue internal Claude/Cursor skills for Headout. The source is a " +
      "SKILL.md file the teammate uploaded. Type MUST be \"skill\". Prefer the " +
      "frontmatter name and description; use the body only to sharpen the one-liner, " +
      "longer description, and tags. Do not invent capabilities the file does not " +
      "state. If unsure of the team, choose Platform. Set lowConfidence false when " +
      "frontmatter name+description are present and usable.\n\n" +
      TAG_POLICY_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Skill frontmatter name: ${skill.name || "(missing)"}\n` +
          `Skill frontmatter description: ${skill.description || "(missing)"}\n` +
          (url ? `Optional install/docs URL: ${url}\n` : "") +
          `Existing catalogue tags (reuse these before inventing new ones): ${renderTagVocabulary(
            vocabulary,
          )}\n` +
          `Skill body excerpt:\n${bodyExcerpt || "(empty body)"}`,
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tool_metadata",
  );

  const parsed = (toolBlock?.input ?? {}) as {
    type?: string;
    title?: string;
    oneLiner?: string;
    description?: string;
    tags?: string[];
    team?: string;
    lowConfidence?: boolean;
  };

  const fallbackTitle = skill.name || "Untitled skill";
  const fallbackOneLiner =
    skill.description.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 160) ||
    skill.description.slice(0, 160);
  const fallbackDescription =
    skill.description ||
    (skill.body ? skill.body.slice(0, 800) : "Claude skill uploaded via Storefront.");

  const { tags, belowMin } = await resolveInferredTags(parsed.tags ?? [], async () => {
    const regen = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      tools: [TAGS_TOOL_DEF],
      tool_choice: { type: "tool", name: "tool_tags" },
      system:
        "You assign catalogue tags for an internal Headout Claude skill. Return ONLY tags. " +
        `You MUST return between ${MIN_TAGS} and ${MAX_TAGS} SPECIFIC facet tags — never the banned generic words. ` +
        "Prefer existing vocabulary.\n\n" +
        TAG_POLICY_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Title: ${parsed.title ?? fallbackTitle}\n` +
            `One-liner: ${parsed.oneLiner ?? fallbackOneLiner}\n` +
            `Description: ${parsed.description ?? fallbackDescription}\n` +
            `Existing catalogue tags: ${renderTagVocabulary(vocabulary)}\n` +
            `Skill body excerpt:\n${bodyExcerpt || "(empty)"}`,
        },
      ],
    });
    const tagBlock = regen.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tool_tags",
    );
    return ((tagBlock?.input as { tags?: string[] } | undefined)?.tags ?? []) as string[];
  });

  const preview: InferredTool = {
    type: "skill",
    title: (parsed.title ?? fallbackTitle).trim() || fallbackTitle,
    oneLiner: (parsed.oneLiner ?? fallbackOneLiner).trim() || fallbackOneLiner,
    description: (parsed.description ?? fallbackDescription).trim() || fallbackDescription,
    tags,
    team: parsed.team ?? "Platform",
    url,
    ownerName: "",
    ownerSlackId: "",
    verified: false,
    source: "manual",
    visibility: "org",
    status: "live",
    accessLevel: "open",
  };

  const thinFrontmatter = !skill.name || !skill.description;
  return {
    preview,
    lowConfidence: thinFrontmatter || (parsed.lowConfidence ?? false) || belowMin,
  };
}

const TAGS_TOOL_DEF: Anthropic.Tool = {
  name: "tool_tags",
  description: "Extract a list of specific catalogue tags for an internal Headout AI tool.",
  input_schema: {
    type: "object",
    properties: {
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["tags"],
  },
};

/**
 * Focused recovery reprompt: ask only for a fresh tag set when the first
 * inference yielded too few specific facets.
 */
async function regenerateTags(
  url: string,
  parsed: { title: string; oneLiner: string; description: string },
  signals: PageSignals,
  vocabulary: string[],
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [TAGS_TOOL_DEF],
    tool_choice: { type: "tool", name: "tool_tags" },
    system:
      "You assign catalogue tags for an internal Headout AI tool. Return ONLY tags. " +
      `You MUST return between ${MIN_TAGS} and ${MAX_TAGS} SPECIFIC facet tags — never the banned generic words. ` +
      "Ground the tags in the supplied details and page signals; prefer existing vocabulary.\n\n" +
      TAG_POLICY_PROMPT,
    messages: [
      {
        role: "user",
        content: `URL: ${url}\nTitle: ${parsed.title}\nOne-liner: ${parsed.oneLiner}\nDescription: ${parsed.description}\nExisting catalogue tags (reuse these before inventing new ones): ${renderTagVocabulary(
          vocabulary,
        )}\nPage signals:\n${renderSignals(signals)}`,
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tool_tags",
  );
  const out = (toolBlock?.input ?? {}) as { tags?: unknown };
  return Array.isArray(out.tags) ? (out.tags as string[]) : [];
}

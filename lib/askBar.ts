import type { AskResult, Tool } from "@/lib/types";
import { getKitById, KITS } from "@/lib/mockData";
import { compareLifecycle } from "@/lib/toolMeta";

export const STOREFRONT_SLACK_CHANNEL = "#project-ai-internal-storefront";
export const STOREFRONT_SLACK_URL =
  "https://headout.slack.com/archives/project-ai-internal-storefront";

const NO_MATCH_MESSAGE = `No tool matches that. Try ${STOREFRONT_SLACK_CHANNEL} on Slack.`;
const GIBBERISH_MESSAGE = "Try describing what problem you're trying to solve.";

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

function isGibberish(query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;
  if (/^(asdf|qwerty|xyz|blah|foo|bar)$/.test(normalized)) return true;
  if (/^[^a-z0-9\s'-]+$/.test(normalized)) return true;

  const words = normalized.split(/\s+/);
  if (words.length === 1 && words[0].length < 2) return true;

  if (words.length === 1 && words[0].length > 8) {
    const vowelRatio =
      (normalized.match(/[aeiou]/g)?.length ?? 0) / normalized.length;
    if (vowelRatio < 0.15) return true;
  }

  return false;
}

export function searchTools(query: string, tools: Tool[]): Tool[] {
  const q = normalizeQuery(query);
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "that",
    "with",
    "from",
    "find",
    "need",
    "something",
    "me",
    "get",
    "how",
    "what",
    "where",
    "a",
    "an",
  ]);
  const keywords = q
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  if (keywords.length === 0) {
    const single = q.trim();
    if (single.length >= 3) {
      keywords.push(single);
    }
  }

  return tools
    .map((tool) => {
      const haystack =
        `${tool.name} ${tool.oneLiner} ${tool.description} ${tool.tags.join(" ")} ${tool.types.join(" ")} ${tool.team}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 1;
      }
      return { tool, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareLifecycle(a.tool, b.tool))
    .slice(0, 5)
    .map(({ tool }) => tool);
}

export function resolveAskQuery(query: string, tools: Tool[]): AskResult {
  const trimmed = query.trim();

  if (!trimmed || isGibberish(trimmed)) {
    return {
      type: "fallback",
      query: trimmed,
      message: GIBBERISH_MESSAGE,
      reason: "gibberish",
    };
  }

  const results = searchTools(trimmed, tools);

  if (results.length === 0) {
    return {
      type: "fallback",
      query: trimmed,
      message: NO_MATCH_MESSAGE,
      reason: "no-match",
    };
  }

  return { type: "tools", query: trimmed, tools: results };
}

export function getClosestKits(query: string, limit = 3) {
  const q = query.toLowerCase().trim();
  if (!q) return KITS.slice(0, limit);

  const keywords = q.split(/\s+/).filter((w) => w.length >= 2);
  const scored = KITS.map((kit) => {
    const haystack = `${kit.name} ${kit.description}`.toLowerCase();
    const score = keywords.filter((kw) => haystack.includes(kw)).length;
    return { kit, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored.slice(0, limit).map(({ kit }) => kit);
  }

  return KITS.slice(0, limit);
}

export function buildPlannedSubmitUrl(query: string): string {
  const trimmed = query.trim();
  const params = new URLSearchParams({ status: "planned" });
  if (trimmed) {
    params.set("name", trimmed);
    params.set("oneLiner", `Looking for something that ${trimmed}`);
  }
  return `/submit?${params.toString()}`;
}

export function filterRegistryTools(
  tools: Tool[],
  search: string,
  typeFilter: string,
  teamFilter: string,
  kitId?: string,
): Tool[] {
  const q = search.toLowerCase().trim();
  const kit = kitId ? getKitById(kitId) : undefined;
  const kitIdSet = kit ? new Set(kit.toolIds) : null;

  return tools.filter((tool) => {
    if (tool.approvalStatus !== "approved") return false;
    if (kitIdSet && !kitIdSet.has(tool.id)) return false;
    if (typeFilter && !tool.types.includes(typeFilter as Tool["types"][number])) {
      return false;
    }
    if (teamFilter && tool.team !== teamFilter) return false;
    if (!q) return true;

    const haystack =
      `${tool.name} ${tool.oneLiner} ${tool.tags.join(" ")} ${tool.types.join(" ")} ${tool.owner.name} ${tool.team}`.toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

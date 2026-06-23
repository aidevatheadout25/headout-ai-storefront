import type { AskResult, Tool } from "@/lib/types";

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

function isKnowledgeIntent(query: string): boolean {
  const q = normalizeQuery(query);
  return (
    q.startsWith("how ") ||
    q.includes("how do i") ||
    q.includes("how can i") ||
    q.includes("what's the process") ||
    q.includes("what is the process") ||
    q.includes("where do i") ||
    q.includes("who do i ask")
  );
}

function isToolDiscoveryIntent(query: string): boolean {
  const q = normalizeQuery(query);
  return (
    q.startsWith("find ") ||
    q.includes("find me") ||
    q.includes("search for") ||
    q.includes("looking for") ||
    q.includes("need a") ||
    q.includes("need something") ||
    q.includes("something that") ||
    q.includes("tool for") ||
    q.includes("pulls ") ||
    q.includes("pull ")
  );
}

function searchTools(query: string, tools: Tool[]): Tool[] {
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
        `${tool.name} ${tool.oneLiner} ${tool.description} ${tool.tags.join(" ")} ${tool.type} ${tool.team}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 1;
      }
      return { tool, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ tool }) => tool);
}

function matchesScraperIntent(query: string): boolean {
  const q = normalizeQuery(query);
  return (
    q.includes("scraper") ||
    q.includes("scrape") ||
    q.includes("scraping") ||
    (q.includes("find") && q.includes("viator")) ||
    (q.includes("pull") && q.includes("availability"))
  );
}

function matchesBigQueryIntent(query: string): boolean {
  const q = normalizeQuery(query);
  return (
    q.includes("bigquery") ||
    q.includes("bq access") ||
    q.includes("bq ") ||
    (q.includes("get") && q.includes("access") && q.includes("data")) ||
    (q.includes("how") && q.includes("access") && q.includes("query"))
  );
}

export function resolveAskQuery(query: string, tools: Tool[]): AskResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      type: "fallback",
      query: trimmed,
      message: "Try describing what problem you're trying to solve.",
    };
  }

  if (isGibberish(trimmed)) {
    return {
      type: "fallback",
      query: trimmed,
      message: "Try describing what problem you're trying to solve.",
    };
  }

  if (matchesBigQueryIntent(trimmed)) {
    return {
      type: "knowledge",
      query: trimmed,
      answer:
        "To get BigQuery access at Headout, request a data-platform seat in #data-platform. You'll need your manager's approval and a brief use-case blurb. Once approved, Jordan's team provisions a service account and adds you to the headout-analytics project. Most internal dashboards (like the availability dashboard) are already wired — you may just need Looker access instead.",
      sources: [
        {
          label: "Data platform onboarding (Notion)",
          url: "https://notion.headout.internal/data-platform-onboarding",
        },
        {
          label: "BigQuery availability dashboard",
          url: "/tools/bq-availability-dashboard",
        },
      ],
    };
  }

  if (isKnowledgeIntent(trimmed)) {
    return {
      type: "knowledge",
      query: trimmed,
      uncertain: true,
      answer:
        "I don't have a confident answer — try #data-platform on Slack for help with internal process questions.",
      sources: [
        {
          label: "#data-platform on Slack",
          url: "https://headout.slack.com/archives/data-platform",
        },
      ],
    };
  }

  if (matchesScraperIntent(trimmed) || isToolDiscoveryIntent(trimmed)) {
    const scraperTools = tools.filter(
      (t) =>
        t.tags.includes("scraping") ||
        t.name.toLowerCase().includes("scraper") ||
        t.name.toLowerCase().includes("scrape"),
    );
    if (matchesScraperIntent(trimmed) && scraperTools.length > 0) {
      return { type: "tools", query: trimmed, tools: scraperTools };
    }
    return { type: "tools", query: trimmed, tools: searchTools(trimmed, tools) };
  }

  const results = searchTools(trimmed, tools);
  return { type: "tools", query: trimmed, tools: results };
}

import { getKitById } from "@/lib/mockData";

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
    if (tool.status !== "approved") return false;
    if (kitIdSet && !kitIdSet.has(tool.id)) return false;
    if (typeFilter && tool.type !== typeFilter) return false;
    if (teamFilter && tool.team !== teamFilter) return false;
    if (!q) return true;

    const haystack =
      `${tool.name} ${tool.oneLiner} ${tool.tags.join(" ")} ${tool.owner.name} ${tool.team}`.toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

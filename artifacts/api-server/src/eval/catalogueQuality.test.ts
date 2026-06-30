/**
 * Retrieval-quality + no-match regression checks for the concierge chat.
 *
 * The chat front door is only as good as (a) the semantic search that ranks
 * catalogue tools and (b) the agent's decision to say "no match" when nothing
 * fits. Both can silently regress when the prompt, model or embedding pipeline
 * changes. These tests pin that behaviour against the seeded catalogue.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 * Requires: DATABASE_URL (seeded). The no-match block additionally needs the
 * Replit OpenAI AI integration env and is skipped when it is absent.
 */
import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { searchCatalogue, MIN_MATCH_SIMILARITY } from "../lib/catalogue";
import { seedCatalogueIfEmpty } from "../lib/seed";

/**
 * Representative asks mapped to the seeded tool that should serve them, and the
 * rank (1-based) it must appear within. These are phrased the way a teammate
 * would ask — not as keyword echoes of the tool name — so they exercise the
 * embeddings, not string matching.
 */
const RETRIEVAL_FIXTURES: { query: string; expect: string; within: number }[] = [
  { query: "summarise what guests are saying in our reviews", expect: "Review Radar", within: 3 },
  { query: "turn a photo of a receipt into an expense report", expect: "Expense Buddy", within: 3 },
  { query: "summarise a meeting transcript into notes and action items", expect: "Meeting Notes Zep", within: 3 },
  { query: "look up a customer's booking from inside Slack", expect: "Slack Booking Lookup", within: 3 },
  { query: "draft a day-by-day travel itinerary for a city", expect: "Itinerary Writer", within: 3 },
  { query: "decide whether to approve or escalate a refund request", expect: "Refund Triage", within: 3 },
  { query: "export customer cohorts to a CSV for analysis", expect: "Cohort Exporter", within: 3 },
  { query: "check how competitors are pricing an experience", expect: "Competitor Price Watch", within: 3 },
  { query: "see live availability and sell-out risk for experiences", expect: "Inventory Pulse", within: 3 },
  { query: "assign tour guides to upcoming tours by language and load", expect: "Tour Guide Scheduler", within: 3 },
];

before(async () => {
  await seedCatalogueIfEmpty();
});

describe("catalogue retrieval quality", () => {
  for (const fx of RETRIEVAL_FIXTURES) {
    test(`"${fx.query}" surfaces ${fx.expect} in top ${fx.within}`, async () => {
      const results = await searchCatalogue(fx.query, 6);
      const names = results.map((r) => r.name);
      const rank = names.indexOf(fx.expect);
      assert.notEqual(
        rank,
        -1,
        `expected "${fx.expect}" in results, got: ${names.join(", ")}`,
      );
      assert.ok(
        rank < fx.within,
        `expected "${fx.expect}" within top ${fx.within}, but it ranked #${
          rank + 1
        }: ${names.join(", ")}`,
      );
    });
  }
});

/**
 * Loosely-related / off-catalogue asks that have NO genuine tool. Their best
 * match must score below the minimum-match threshold so the concierge treats
 * them as "no match" and routes to build/request instead of confidently
 * recommending a barely-relevant tool. Phrased as real asks, not nonsense.
 */
const WEAK_QUERIES: string[] = [
  "What's the weather forecast for London this weekend?",
  "book me a flight to Paris next Tuesday",
  "what's a good recipe for chocolate cake",
  "what's the stock price of Apple",
  "plan my wedding guest list",
];

describe("weak-match similarity guardrail", () => {
  test("every positive fixture clears the minimum-match threshold", async () => {
    for (const fx of RETRIEVAL_FIXTURES) {
      const results = await searchCatalogue(fx.query, 6);
      const match = results.find((r) => r.name === fx.expect);
      assert.ok(match, `expected "${fx.expect}" in results for "${fx.query}"`);
      assert.ok(
        (match.similarity ?? 0) >= MIN_MATCH_SIMILARITY,
        `"${fx.expect}" scored ${match.similarity?.toFixed(3)} for "${
          fx.query
        }", below the ${MIN_MATCH_SIMILARITY} match threshold`,
      );
    }
  });

  for (const query of WEAK_QUERIES) {
    test(`loosely-related "${query}" has no above-threshold match`, async () => {
      const results = await searchCatalogue(query, 6);
      const strong = results.filter(
        (r) => (r.similarity ?? 0) >= MIN_MATCH_SIMILARITY,
      );
      assert.equal(
        strong.length,
        0,
        `expected no tool to clear the ${MIN_MATCH_SIMILARITY} threshold, but got: ${strong
          .map((t) => `${t.name} (${t.similarity?.toFixed(3)})`)
          .join(", ")}`,
      );
    });
  }
});

const AI_READY =
  !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
  !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

describe(
  "concierge no-match path",
  { skip: AI_READY ? false : "OpenAI AI integration env not set" },
  () => {
    let runChat: typeof import("../lib/chatAgent").runChat;

    before(async () => {
      ({ runChat } = await import("../lib/chatAgent"));
    });

    test("an off-catalogue request flips the no-match path", async () => {
      const res = await runChat([
        {
          role: "user",
          content: "What's the weather forecast for London this weekend?",
        },
      ]);
      assert.equal(
        res.noMatch,
        true,
        `expected no-match for an off-catalogue ask, but got tools: [${res.tools
          .map((t) => t.name)
          .join(", ")}] — message: ${res.message}`,
      );
      assert.equal(
        res.tools.length,
        0,
        `no-match replies must not recommend tools, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}]`,
      );
    });

    test("a clear in-catalogue request returns a matching tool", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to track sentiment and recurring themes across our guest reviews",
        },
      ]);
      assert.equal(
        res.noMatch,
        false,
        `expected a match for a clearly in-catalogue ask — message: ${res.message}`,
      );
      assert.ok(
        res.tools.some((t) => t.name === "Review Radar"),
        `expected "Review Radar" to be recommended, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}]`,
      );
    });
  },
);

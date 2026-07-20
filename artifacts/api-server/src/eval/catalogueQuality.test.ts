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
 *
 * Note: as of the pgvector HNSW (vector_cosine_ops) index on `tools.embedding`,
 * `searchCatalogue` is served by an approximate-nearest-neighbour scan rather
 * than a full table scan. These fixtures double as the retrieval sanity check
 * that indexing did not change which tools surface; the index existence + the
 * planner using it are pinned separately in catalogueIndex.test.ts.
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

const AI_READY = !!(
  process.env.ANTHROPIC_API_KEY ||
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
);

describe(
  "concierge no-match path",
  { skip: AI_READY ? false : "ANTHROPIC_API_KEY not set" },
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

/**
 * Concierge = search + route. The critique agent (runScopeChat) is the single
 * owner of scoping — the concierge never runs its own gate interview and
 * never hands off to a builder itself. These pin the deterministic routing:
 * stage, not LLM phrasing, is what's asserted throughout.
 */
describe(
  "concierge search + route",
  { skip: AI_READY ? false : "ANTHROPIC_API_KEY not set" },
  () => {
    let runChat: typeof import("../lib/chatAgent").runChat;

    before(async () => {
      ({ runChat } = await import("../lib/chatAgent"));
    });

    test("an explicit 'build me X' searches first and offers the existing match, not a build", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "Build me something that summarises sentiment and themes across our guest reviews",
        },
      ]);
      // Even though the user said "build", the existing tool must surface first
      // and the conversation must not be routed into scope mode.
      assert.notEqual(
        res.stage,
        "scope",
        `a 'build me X' with an existing match must not enter scope mode — message: ${res.message}`,
      );
      assert.notEqual(res.stage, "handoff", "the deprecated handoff stage must never appear");
      assert.equal(
        res.recommendedBuilder,
        null,
        "the concierge never sets a recommended builder — that's the critique agent's job",
      );
      assert.ok(
        res.tools.some((t) => t.name === "Review Radar"),
        `expected the existing "Review Radar" to be offered first, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}] — message: ${res.message}`,
      );
    });

    test("reuse-check runs before scoping — existing match is offered before any build question", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build something to check how competitors are pricing tours and experiences",
        },
      ]);
      assert.notEqual(
        res.stage,
        "scope",
        `a reuse-check turn with an existing match must not enter scope mode — message: ${res.message}`,
      );
      assert.equal(res.recommendedBuilder, null);
      assert.ok(
        res.tools.some((t) => t.name === "Competitor Price Watch"),
        `expected "Competitor Price Watch" to be offered in the reuse-check, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}] — message: ${res.message}`,
      );
    });

    // (a) A typed build ask for something not in the catalogue reaches scope
    // mode directly — no four-gate interview, no handoff card.
    test("(a) 'build a tool for X not in the catalogue' reaches stage 'scope' on the first reply", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build an internal tool to plan and run my team's quarterly offsite events",
        },
      ]);
      assert.equal(
        res.stage,
        "scope",
        `an off-catalogue build ask should route straight to the critique agent — got stage "${res.stage}", message: ${res.message}`,
      );
      assert.notEqual(res.stage, "handoff", "the deprecated handoff stage must never appear");
      assert.equal(res.recommendedBuilder, null);
    });

    // (b) The two-turn vague case: a build statement with nothing to search on
    // gets one deterministic clarifying question, and the follow-up — which
    // doesn't itself match any build-intent pattern — must still route to
    // scope because the prior assistant turn was the clarifier.
    test("(b) vague build statement clarifies once, then the follow-up reaches scope", async () => {
      const turn1History = [
        { role: "user" as const, content: "I am trying to build something new" },
      ];
      const turn1 = await runChat(turn1History);
      assert.equal(
        turn1.stage,
        "chat",
        `a vague build statement should get a plain clarifying question, not enter scope yet — message: ${turn1.message}`,
      );
      assert.ok(turn1.message.length > 0, "the clarifier must not be empty");

      const turn2History = [
        ...turn1History,
        { role: "assistant" as const, content: turn1.message },
        {
          role: "user" as const,
          content:
            "I want to upload a spreadsheet of candidates, scrape their LinkedIn profiles, and pull their emails automatically.",
        },
      ];
      const turn2 = await runChat(turn2History);
      assert.equal(
        turn2.stage,
        "scope",
        `the answer to the build clarifier should route to scope even without matching a build-intent pattern itself — message: ${turn2.message}`,
      );
      assert.notEqual(turn2.stage, "handoff");
    });

    // (c) Once in scope mode, a further user turn (mode: "scope", as the
    // client sends on every subsequent scope message) must still be handled
    // by the critique agent — proving scope mode persists past the first
    // exchange. This is the API-level half of the client-wiring fix; the
    // client sets inScopeMode from a live stage:"scope" response so it keeps
    // sending mode:"scope" on later turns (see HomeChat.tsx).
    test("(c) a third turn in an active scope conversation is still handled by the critique agent", async () => {
      const res = await runChat(
        [
          {
            role: "user",
            content:
              "I want to build a tool that automates our weekly ops report",
          },
          {
            role: "assistant",
            content: "What does the ops report cover, and who reads it each week?",
          },
          {
            role: "user",
            content:
              "It pulls numbers from three dashboards every Monday and goes to the whole ops team.",
          },
          {
            role: "assistant",
            content: "Is there an API for each dashboard, or is it manual/export-only?",
          },
          {
            role: "user",
            content: "Two have APIs, one is a manual export.",
          },
        ],
        {
          mode: "scope",
          searchContext: { query: "automate weekly ops report", nearMisses: [] },
        },
      );
      assert.ok(
        ["scope", "brief", "kill"].includes(res.stage),
        `a continued scope conversation must stay with the critique agent — got stage "${res.stage}", message: ${res.message}`,
      );
      assert.notEqual(res.stage, "handoff", "the deprecated handoff stage must never appear");
    });

    // (d) An infra-heavy idea must not get generic "ask the platform team"
    // advice — platform team may only come up for API keys/credentials, or
    // not at all.
    test("(d) an infra-heavy HR sourcing idea mentions the platform team only for API keys, or not at all", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build a tool where I upload an Excel sheet of candidates, it scrapes their LinkedIn profiles via Apify, pulls their emails through RocketReach, and writes everything into a Google Sheet.",
        },
      ]);
      assert.equal(
        res.stage,
        "scope",
        `an off-catalogue infra-heavy build ask should route straight to the critique agent — got stage "${res.stage}", message: ${res.message}`,
      );
      const lower = res.message.toLowerCase();
      if (lower.includes("platform team")) {
        const nearApiKeyContext =
          lower.includes("api key") ||
          lower.includes("credential") ||
          lower.includes("access") ||
          lower.includes("provision");
        assert.ok(
          nearApiKeyContext,
          `platform team must only be mentioned for API keys/credentials/access — message: ${res.message}`,
        );
      }
      assert.ok(
        !lower.includes("hosting") && !lower.includes("infra") && !lower.includes("architecture"),
        `the critique agent must not give hosting/infra/architecture advice — message: ${res.message}`,
      );
    });

    test("clear registration intent routes to register stage, not handoff or Slack-only", async () => {
      const res = await runChat([
        { role: "user", content: "I built a tool, how do I register it?" },
      ]);
      assert.equal(
        res.stage,
        "register",
        `clear registration intent must route to register stage, got: ${res.stage} — message: ${res.message}`,
      );
      assert.notEqual(
        res.stage,
        "handoff",
        `registration intent must not trigger build hand-off — message: ${res.message}`,
      );
      // Must not tell the user to go to Slack as the primary answer.
      const lower = res.message.toLowerCase();
      const isSlackOnly =
        lower.includes("slack") &&
        !lower.includes("here") &&
        !lower.includes("catalogue") &&
        !lower.includes("register") &&
        !lower.includes("paste") &&
        !lower.includes("link");
      assert.ok(
        !isSlackOnly,
        `registration must not be answered with a Slack-only reply — message: ${res.message}`,
      );
    });

    test("'add my tool to the catalogue' routes to register stage", async () => {
      const res = await runChat([
        { role: "user", content: "add my tool to the catalogue" },
      ]);
      assert.equal(
        res.stage,
        "register",
        `'add my tool' must route to register stage, got: ${res.stage} — message: ${res.message}`,
      );
      assert.notEqual(res.stage, "handoff");
    });

    test("'I just finished building something, what do I do next?' routes to register stage", async () => {
      const res = await runChat([
        {
          role: "user",
          content: "I just finished building something, what do I do next?",
        },
      ]);
      assert.equal(
        res.stage,
        "register",
        `'I just finished building' must route to register stage, got: ${res.stage} — message: ${res.message}`,
      );
      assert.notEqual(res.stage, "handoff");
    });

    test("a bare-pasted URL is never handed off to a builder and never gives a Slack-only reply", async () => {
      const res = await runChat([
        {
          role: "user",
          content: "https://tools.headout.internal/my-new-tool",
        },
      ]);
      // A bare URL is ambiguous — accept register OR a clarifying question, but never handoff
      // and never a Slack-only reply.
      assert.notEqual(
        res.stage,
        "handoff",
        `a bare URL must not trigger build hand-off — message: ${res.message}`,
      );
      const lower = res.message.toLowerCase();
      const isSlackOnly =
        lower.includes("slack") &&
        !lower.includes("here") &&
        !lower.includes("catalogue") &&
        !lower.includes("register") &&
        !lower.includes("paste") &&
        !lower.includes("link") &&
        !lower.includes("what") &&
        !lower.includes("help");
      assert.ok(
        !isSlackOnly,
        `a bare URL must not produce a Slack-only reply — message: ${res.message}`,
      );
    });
  },
);

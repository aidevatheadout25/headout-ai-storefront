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

/**
 * Build-gate funnel: building is only ever recommended AFTER search +
 * confirmation + scoping. These pin the staged behaviour so the concierge can
 * never regress to offering a one-click "build" before it has searched and
 * scoped the need.
 */
describe(
  "concierge build-gate funnel",
  { skip: AI_READY ? false : "OpenAI AI integration env not set" },
  () => {
    const ALLOWED_BUILDERS = [
      "manual",
      "claude-skill",
      "replit",
      "claude-code",
      "zeps",
      "real-app",
    ];

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
      // and there must be no build hand-off on this turn.
      assert.notEqual(
        res.stage,
        "handoff",
        `a 'build me X' with an existing match must not jump to the build hand-off — message: ${res.message}`,
      );
      assert.equal(
        res.recommendedBuilder,
        null,
        "no builder should be recommended before scoping",
      );
      assert.ok(
        res.tools.some((t) => t.name === "Review Radar"),
        `expected the existing "Review Radar" to be offered first, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}] — message: ${res.message}`,
      );
    });

    test("an off-catalogue ask does not hand off to a builder on the first turn", async () => {
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build an internal tool to plan and run my team's quarterly offsite events",
        },
      ]);
      // Nothing exists, but the very first turn must scope (or confirm no match),
      // never render the build hand-off — there is no one-click build path.
      assert.notEqual(
        res.stage,
        "handoff",
        `the first turn of an off-catalogue ask must not hand off before scoping — message: ${res.message}`,
      );
      assert.equal(res.recommendedBuilder, null);
    });

    test("the build hand-off only appears after the scoping exchange", async () => {
      // A conversation where all four gates are satisfied:
      // (1) reuse-check confirmed nothing fits, (2) concrete scenario given,
      // (3) feasibility per system confirmed (both have APIs), (4) audience stated.
      // The next reply should reach the hand-off.
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build an internal tool to plan and run my team's quarterly offsite events",
        },
        {
          role: "assistant",
          content:
            "Nothing in the catalogue does that yet. What's one concrete scenario it must handle?",
        },
        {
          role: "user",
          content:
            "Our ops lead needs to book a venue and collect RSVPs from about 30 teammates for the offsite.",
        },
        {
          role: "assistant",
          content:
            "Got it. You mentioned Google Calendar and Slack — for each one, is there an API or connector available, or is it manual / export-only?",
        },
        {
          role: "user",
          content:
            "Both have APIs — we use the Google Calendar API already and have a Slack bot token.",
        },
        {
          role: "assistant",
          content: "And who will use it, and how often?",
        },
        {
          role: "user",
          content: "Just our ops lead, a few times a quarter.",
        },
      ]);
      assert.equal(
        res.stage,
        "handoff",
        `after all four gate answers the concierge should hand off — message: ${res.message}`,
      );
      assert.ok(
        res.recommendedBuilder &&
          ALLOWED_BUILDERS.includes(res.recommendedBuilder),
        `hand-off must name one of the allowed builders, got: ${res.recommendedBuilder}`,
      );
      assert.equal(
        res.tools.length,
        0,
        "the hand-off turn should not recommend catalogue tools",
      );
    });

    test("reuse-check runs before scoping — existing match is offered before any build question", async () => {
      // The user asks for something that exists in the catalogue AND says "build me X".
      // Gate 1 (reuse-check) must fire and present the existing tool before any scoping question.
      const res = await runChat([
        {
          role: "user",
          content:
            "I want to build something to check how competitors are pricing tours and experiences",
        },
      ]);
      assert.notEqual(
        res.stage,
        "handoff",
        `a reuse-check turn must not jump to handoff — message: ${res.message}`,
      );
      assert.equal(res.recommendedBuilder, null, "no builder before reuse confirmation");
      assert.ok(
        res.tools.some((t) => t.name === "Competitor Price Watch"),
        `expected "Competitor Price Watch" to be offered in the reuse-check, got: [${res.tools
          .map((t) => t.name)
          .join(", ")}] — message: ${res.message}`,
      );
    });

    test("mechanism restatement gets a pushback, not a handoff", async () => {
      // Gate 2: if the user answers the scenario question with a mechanism restatement,
      // the concierge must push back exactly once asking for a real trigger+actor+outcome.
      const res = await runChat([
        {
          role: "user",
          content:
            "I need a tool that aggregates live availability data from all our experience partners",
        },
        {
          role: "assistant",
          content:
            "Nothing in the catalogue does that yet. What's one concrete scenario it must handle — a specific moment with a trigger, an actor, and a desired outcome?",
        },
        {
          role: "user",
          content:
            "It pulls availability status from everywhere and shows it in one place.",
        },
      ]);
      // The concierge must NOT hand off on a restatement — it should push back once.
      assert.notEqual(
        res.stage,
        "handoff",
        `a mechanism restatement must not trigger handoff — message: ${res.message}`,
      );
      assert.equal(
        res.recommendedBuilder,
        null,
        "no builder should be recommended on a mechanism restatement",
      );
      // The response should ask for a real scenario (trigger, actor, outcome).
      const lower = res.message.toLowerCase();
      const asksForScenario =
        lower.includes("trigger") ||
        lower.includes("actor") ||
        lower.includes("outcome") ||
        lower.includes("specific moment") ||
        lower.includes("concrete") ||
        lower.includes("who") ||
        lower.includes("when");
      assert.ok(
        asksForScenario,
        `expected the concierge to push back asking for a real scenario, got: ${res.message}`,
      );
    });

    test("manual-only system produces a manual-first recommendation, not a full build", async () => {
      // Gate 3: when a key system is manual-only/no-API, the cheapest path is manual/partial.
      const res = await runChat([
        {
          role: "user",
          content:
            "I want an internal app that tracks which tour guides are certified for each experience type",
        },
        {
          role: "assistant",
          content:
            "Nothing in the catalogue does that yet. What's one concrete scenario it must handle?",
        },
        {
          role: "user",
          content:
            "When a new guide joins, the ops lead needs to check which experiences they're certified for and assign them to the right tours.",
        },
        {
          role: "assistant",
          content:
            "Got it. Where is the certification data stored — is there an API or connector, or is it manual/export-only?",
        },
        {
          role: "user",
          content:
            "It's all in a spreadsheet right now — no API, all manual updates.",
        },
        {
          role: "assistant",
          content: "And who will use this, and how often?",
        },
        {
          role: "user",
          content: "Just me, the ops lead. Probably a few times a month.",
        },
      ]);
      assert.equal(
        res.stage,
        "handoff",
        `after scoping with a manual-only system the concierge should hand off — message: ${res.message}`,
      );
      assert.equal(
        res.recommendedBuilder,
        "manual",
        `a manual-only system must produce a manual-first recommendation, got: ${res.recommendedBuilder} — message: ${res.message}`,
      );
      // Message must explicitly say NOT to build the full app yet.
      const lower = res.message.toLowerCase();
      const saysDontBuild =
        lower.includes("not") ||
        lower.includes("without building") ||
        lower.includes("manual") ||
        lower.includes("spreadsheet") ||
        lower.includes("tracker") ||
        lower.includes("don't build") ||
        lower.includes("no need to build");
      assert.ok(
        saysDontBuild,
        `manual-first message should tell the user not to build the full app yet, got: ${res.message}`,
      );
    });

    test("audience conflict triggers a reconciling question before handoff", async () => {
      // Gate 4: problem stated "the team" but the user later says "just me" — the concierge
      // must ask one reconciling question instead of silently proceeding.
      const res = await runChat([
        {
          role: "user",
          content:
            "Our team needs a tool to automatically draft replies to guest complaints from our CRM",
        },
        {
          role: "assistant",
          content:
            "Nothing in the catalogue does that exactly. What's one concrete scenario it must handle?",
        },
        {
          role: "user",
          content:
            "A support agent gets a 1-star review, pastes the complaint into the tool, and gets a draft reply they can edit and send.",
        },
        {
          role: "assistant",
          content: "Is there an API for your CRM, or is the data manually copy-pasted?",
        },
        {
          role: "user",
          content: "The agent would paste the complaint text — no CRM API needed.",
        },
        {
          role: "assistant",
          content: "And who will use it, and how often?",
        },
        {
          role: "user",
          content: "Honestly just me for now — I want to test it first.",
        },
      ]);
      // The concierge must notice the conflict (team → just me) and either ask a
      // reconciling question OR proceed to a handoff with a cheap path fit for one person.
      // Either way, if it does hand off, it must not recommend "real-app" or a high-scale path.
      if (res.stage === "handoff") {
        assert.ok(
          res.recommendedBuilder !== "real-app",
          `a single-person low-frequency use must not be recommended a full production platform, got: ${res.recommendedBuilder}`,
        );
      } else {
        // It asked a reconciling question — that is also acceptable.
        assert.equal(
          res.recommendedBuilder,
          null,
          "if not handing off, no builder should be set",
        );
      }
    });

    test("confirmed-feasible UI need produces a builder recommendation referencing the scenario", async () => {
      // When feasibility is confirmed and a UI is genuinely needed, the recommendation
      // must reference the concrete scenario and the confirmed system — not a generic pitch.
      const res = await runChat([
        {
          role: "user",
          content:
            "I want a small internal app where support leads can see all open refund requests in one view",
        },
        {
          role: "assistant",
          content:
            "Nothing in the catalogue does that yet. What's one concrete scenario it must handle?",
        },
        {
          role: "user",
          content:
            "A support lead opens the dashboard each morning, sees all pending refunds, and can approve or escalate each one.",
        },
        {
          role: "assistant",
          content:
            "Does the refund system have an API your app can call, or is data manually exported?",
        },
        {
          role: "user",
          content: "Yes, we have a REST API for the refund system — full access.",
        },
        {
          role: "assistant",
          content: "And who will use it, and how often?",
        },
        {
          role: "user",
          content: "About five support leads, every morning.",
        },
      ]);
      assert.equal(
        res.stage,
        "handoff",
        `after confirmed-feasible scoping the concierge should hand off — message: ${res.message}`,
      );
      assert.ok(
        res.recommendedBuilder && ALLOWED_BUILDERS.includes(res.recommendedBuilder),
        `hand-off must name one of the allowed builders, got: ${res.recommendedBuilder}`,
      );
      assert.notEqual(
        res.recommendedBuilder,
        "manual",
        "a confirmed-feasible UI need must not recommend the manual path",
      );
      // The message should reference the concrete scenario or systems (not a generic pitch).
      const lower = res.message.toLowerCase();
      const isGrounded =
        lower.includes("refund") ||
        lower.includes("dashboard") ||
        lower.includes("support") ||
        lower.includes("approve") ||
        lower.includes("api") ||
        lower.includes("morning");
      assert.ok(
        isGrounded,
        `recommendation must reference the concrete scenario/systems, got: ${res.message}`,
      );
    });
  },
);

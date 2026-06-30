/**
 * Tag-policy regression checks for the add-tool flow.
 *
 * Tags feed both semantic search (they are part of the embedding text) and the
 * registry facet filters, so weak tags degrade both. These tests pin the
 * deterministic safety net — `normalizeTags` / `hasTooFewTags` — that runs on
 * every add-tool write path regardless of what the LLM returns, plus the
 * read-only vocabulary helper that biases the model toward reuse.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 */
import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BANNED_TAGS,
  MAX_TAGS,
  MIN_TAGS,
  hasTooFewTags,
  normalizeTags,
  resolveInferredTags,
} from "../lib/tagPolicy";
import { fetchTagVocabulary } from "../lib/catalogue";
import { seedCatalogueIfEmpty } from "../lib/seed";

describe("normalizeTags", () => {
  test("lowercases and kebab-cases tags", () => {
    assert.deepEqual(
      normalizeTags(["Support_Tickets", "Booking Lookup", "  SEO  "]),
      ["support-tickets", "booking-lookup", "seo"],
    );
  });

  test("strips every banned generic tag", () => {
    const banned = [...BANNED_TAGS];
    assert.deepEqual(normalizeTags(banned), []);
    // Banned mixed with real facets keeps only the real ones.
    assert.deepEqual(
      normalizeTags(["ai", "slack", "tool", "refunds", "automation"]),
      ["slack", "refunds"],
    );
  });

  test("drops empties and exact duplicates, preserving order", () => {
    assert.deepEqual(
      normalizeTags(["slack", "", "  ", "Slack", "slack", "bookings"]),
      ["slack", "bookings"],
    );
  });

  test(`caps at ${MAX_TAGS} tags`, () => {
    const many = [
      "bigquery",
      "slack",
      "notion",
      "gmail",
      "looker",
      "refunds",
      "forecasting",
      "seo",
    ];
    const out = normalizeTags(many);
    assert.equal(out.length, MAX_TAGS);
    assert.deepEqual(out, many.slice(0, MAX_TAGS));
  });

  test("ignores non-string entries", () => {
    // Defensive against malformed LLM output (numbers/null sneaking in).
    const malformed: unknown[] = ["slack", 42, null, "refunds", "bookings"];
    assert.deepEqual(normalizeTags(malformed), [
      "slack",
      "refunds",
      "bookings",
    ]);
  });

  test("a banned-only input never yields a policy-compliant set", () => {
    const out = normalizeTags(["ai", "tool", "app"]);
    assert.deepEqual(out, []);
    assert.ok(hasTooFewTags(out), "expected too-few-tags to be true");
  });
});

describe("hasTooFewTags", () => {
  test(`is true below ${MIN_TAGS} tags`, () => {
    assert.ok(hasTooFewTags([]));
    assert.ok(hasTooFewTags(["slack"]));
    assert.ok(hasTooFewTags(["slack", "refunds"]));
  });

  test(`is false at or above ${MIN_TAGS} tags`, () => {
    assert.ok(!hasTooFewTags(["slack", "refunds", "bookings"]));
    assert.ok(!hasTooFewTags(["a", "b", "c", "d"]));
  });
});

describe("resolveInferredTags (inference recovery)", () => {
  test("returns the first proposal when it is already compliant", async () => {
    let regenCalls = 0;
    const result = await resolveInferredTags(
      ["slack", "refunds", "bookings"],
      async () => {
        regenCalls += 1;
        return [];
      },
    );
    assert.deepEqual(result.tags, ["slack", "refunds", "bookings"]);
    assert.equal(result.belowMin, false);
    assert.equal(regenCalls, 0, "should not reprompt when already compliant");
  });

  test("reprompts once and recovers when the first proposal normalizes below min", async () => {
    let regenCalls = 0;
    const result = await resolveInferredTags(["ai", "tool", "app"], async () => {
      regenCalls += 1;
      return ["bigquery", "forecasting", "supply-ops"];
    });
    assert.equal(regenCalls, 1, "should reprompt exactly once");
    assert.equal(result.belowMin, false);
    assert.ok(result.tags.length >= MIN_TAGS);
    assert.ok(result.tags.includes("bigquery"));
  });

  test("flags belowMin when the recovery reprompt also fails the policy", async () => {
    const result = await resolveInferredTags(["ai", "tool"], async () => [
      "automation",
      "utility",
    ]);
    assert.ok(result.belowMin, "expected belowMin when recovery still falls short");
    assert.ok(hasTooFewTags(result.tags));
  });

  test("degrades gracefully when the recovery reprompt throws", async () => {
    const result = await resolveInferredTags(["ai", "slack"], async () => {
      throw new Error("LLM unavailable");
    });
    // Keeps the one salvageable tag, surfaces belowMin rather than crashing.
    assert.deepEqual(result.tags, ["slack"]);
    assert.ok(result.belowMin);
  });
});

describe("fetchTagVocabulary", () => {
  before(async () => {
    await seedCatalogueIfEmpty();
  });

  test("returns distinct, non-empty tags from the catalogue", async () => {
    const vocab = await fetchTagVocabulary();
    assert.ok(vocab.length > 0, "expected the seeded catalogue to have tags");
    assert.equal(
      new Set(vocab).size,
      vocab.length,
      "expected vocabulary to be distinct",
    );
    assert.ok(
      vocab.every((t) => t.trim().length > 0),
      "expected no empty tags",
    );
  });
});

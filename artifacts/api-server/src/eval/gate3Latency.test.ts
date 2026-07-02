/**
 * Gate 3 latency threshold tests.
 *
 * verify_capability adds an extra outbound fetch + LLM call to the concierge
 * loop whenever a capability claim needs checking. This file pins that the
 * extra turn stays within acceptable real-wall-clock limits:
 *
 *   • verifyCapability alone: ≤ 20 s (fetch + LLM)
 *   • A Gate-3 conversation turn: ≤ 60 s (agent loop turn may include verify_capability)
 *
 * Both thresholds are generous enough to survive cold starts and moderate
 * network latency while still catching runaway loops or infinite hangs.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 * Requires: DATABASE_URL (seeded) + AI_INTEGRATIONS_ANTHROPIC_BASE_URL
 */
import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { seedCatalogueIfEmpty } from "../lib/seed";

const AI_READY = !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

/** Maximum wall-clock time (ms) allowed for a single verifyCapability call. */
const VERIFY_CAPABILITY_TIMEOUT_MS = 20_000;

/** Maximum wall-clock time (ms) allowed for a Gate 3 conversation turn
 *  that may trigger a verify_capability tool call. */
const GATE3_TURN_TIMEOUT_MS = 60_000;

before(async () => {
  await seedCatalogueIfEmpty();
});

describe(
  "verify_capability latency",
  { skip: AI_READY ? false : "OPENAI_API_KEY not set" },
  () => {
    test(
      `verifyCapability completes within ${VERIFY_CAPABILITY_TIMEOUT_MS / 1000}s`,
      { timeout: VERIFY_CAPABILITY_TIMEOUT_MS + 2_000 },
      async () => {
        const { verifyCapability } = await import("../lib/verifyCapability");
        const start = Date.now();
        const result = await verifyCapability("Claude", "generate Excel files");
        const elapsed = Date.now() - start;

        assert.ok(
          ["boolean", "string"].includes(typeof result.supported),
          `verifyCapability must return a supported value, got: ${JSON.stringify(result)}`,
        );
        assert.ok(
          typeof result.checked_at === "string",
          "verifyCapability must return a checked_at timestamp",
        );
        assert.ok(
          elapsed < VERIFY_CAPABILITY_TIMEOUT_MS,
          `verifyCapability took ${elapsed}ms, exceeded ${VERIFY_CAPABILITY_TIMEOUT_MS}ms threshold`,
        );
      },
    );

    test(
      "second call is served from cache (sub-100ms)",
      { timeout: 5_000 },
      async () => {
        const { verifyCapability } = await import("../lib/verifyCapability");
        // Prime the cache (first call may already be cached from previous test)
        await verifyCapability("Claude", "generate Excel files");
        const start = Date.now();
        await verifyCapability("Claude", "generate Excel files");
        const elapsed = Date.now() - start;
        assert.ok(
          elapsed < 100,
          `cache hit should be sub-100ms, took ${elapsed}ms`,
        );
      },
    );
  },
);

describe(
  "Gate 3 turn latency",
  { skip: AI_READY ? false : "OPENAI_API_KEY not set" },
  () => {
    let runChat: typeof import("../lib/chatAgent").runChat;

    before(async () => {
      ({ runChat } = await import("../lib/chatAgent"));
    });

    test(
      `Gate 3 conversation turn completes within ${GATE3_TURN_TIMEOUT_MS / 1000}s`,
      { timeout: GATE3_TURN_TIMEOUT_MS + 5_000 },
      async () => {
        // A conversation that has passed Gate 1+2 and is at the Gate 3 feasibility
        // question — the agent may call verify_capability before ruling on the system.
        const start = Date.now();
        const res = await runChat([
          {
            role: "user",
            content:
              "I want a tool that uses Claude to automatically generate a PowerPoint deck from a research report",
          },
          {
            role: "assistant",
            content:
              "Nothing in the catalogue does that yet. What's one concrete scenario it must handle?",
          },
          {
            role: "user",
            content:
              "Our analyst uploads a PDF report and the tool generates a finished 10-slide deck they can present to the team.",
          },
          {
            role: "assistant",
            content:
              "Got it. You mentioned Claude — do you know if there's a connector or API available, or is that manual?",
          },
          {
            role: "user",
            content:
              "I'm not sure if Claude can actually output a real PowerPoint file — I thought it could only do text.",
          },
        ]);
        const elapsed = Date.now() - start;

        assert.ok(
          elapsed < GATE3_TURN_TIMEOUT_MS,
          `Gate 3 turn took ${elapsed}ms, exceeded ${GATE3_TURN_TIMEOUT_MS}ms threshold`,
        );
        // Sanity: must return a valid stage
        assert.ok(
          ["chat", "handoff", "register"].includes(res.stage),
          `invalid stage: ${res.stage}`,
        );
        // The concierge must not assert a flat "Claude can't do PowerPoint"
        // without hedging — it should call verify_capability and either confirm
        // it CAN or flag the claim as unverified.
        const lower = res.message.toLowerCase();
        const assertsLimitationFlatly =
          (lower.includes("can't") || lower.includes("cannot") || lower.includes("doesn't support")) &&
          !lower.includes("not certain") &&
          !lower.includes("worth a quick check") &&
          !lower.includes("actually") &&
          !lower.includes("can generate") &&
          !lower.includes("does support");
        assert.ok(
          !assertsLimitationFlatly,
          `Gate 3 must not assert a flat unverified limitation about Claude. Message: ${res.message}`,
        );
      },
    );
  },
);

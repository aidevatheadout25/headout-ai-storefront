/**
 * Gate 3 routing branch tests: verifyCapability result drives the routing decision.
 *
 * These tests stub verifyCapability via the exported `_testOverrides.impl` seam
 * to remove the live-docs network dependency and pin the concierge's routing
 * behaviour for each of the three result branches:
 *
 *   • supported === true    → concierge must NOT route to manual-only for that claim
 *   • supported === false   → concierge acknowledges the limitation
 *   • supported === "unknown" → message must flag the claim as unverified
 *
 * The real OpenAI agent loop still runs — only the verify_capability network
 * call is eliminated.  Because `_testOverrides` is a mutable object exported
 * from verifyCapability.ts, the stub works regardless of module loader (tsx,
 * native ESM, CJS) without requiring mock.module.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 * Requires: AI_INTEGRATIONS_ANTHROPIC_BASE_URL  (the concierge agent loop calls the LLM).
 * Skipped automatically when the Anthropic integration is absent.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { _testOverrides } from "../lib/verifyCapability";
import { runChat } from "../lib/chatAgent";
import { seedCatalogueIfEmpty } from "../lib/seed";

const AI_READY = !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

before(async () => {
  await seedCatalogueIfEmpty();
});

after(() => {
  // Restore the real implementation so other test suites in the same run
  // are not affected.
  _testOverrides.impl = null;
});

// ---------------------------------------------------------------------------
// A Gate-3-level conversation that reliably triggers verify_capability.
// The user expresses uncertainty about whether Claude can output PowerPoint —
// the system prompt requires the concierge to call verify_capability before
// asserting any negative capability claim about a named AI platform.
// ---------------------------------------------------------------------------
const GATE3_HISTORY: { role: "user" | "assistant"; content: string }[] = [
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
];

/** Maximum wall-clock time (ms) for a Gate-3 turn with a synchronous stub. */
const TURN_TIMEOUT_MS = 90_000;

describe(
  "Gate 3 verify_capability routing",
  { skip: AI_READY ? false : "OPENAI_API_KEY not set" },
  () => {
    test(
      "supported===true → concierge does NOT fall back to manual-only for the capability claim",
      { timeout: TURN_TIMEOUT_MS + 5_000 },
      async () => {
        _testOverrides.impl = async () => ({
          supported: true,
          source: "https://docs.claude.com",
          checked_at: new Date().toISOString(),
        });

        const res = await runChat(GATE3_HISTORY);

        assert.ok(
          ["chat", "handoff", "register"].includes(res.stage),
          `invalid stage: ${res.stage}`,
        );

        // When the live check confirms the capability, the concierge must not
        // route to manual-only citing an unconfirmed platform limitation.
        // A manual recommendation is only valid when OTHER systems (not the
        // platform capability) are the real blocker.
        const lower = res.message.toLowerCase();
        const routesToManualDueToPlatformGap =
          res.recommendedBuilder === "manual" &&
          (lower.includes("can't") ||
            lower.includes("cannot") ||
            lower.includes("doesn't support") ||
            lower.includes("not support")) &&
          !lower.includes("not certain") &&
          !lower.includes("worth a quick check") &&
          !lower.includes("actually") &&
          !lower.includes("can generate") &&
          !lower.includes("does support") &&
          !lower.includes("confirmed");

        assert.ok(
          !routesToManualDueToPlatformGap,
          `When supported===true the concierge must not route to manual-only citing an unconfirmed platform gap. Stage: ${res.stage}, Builder: ${res.recommendedBuilder ?? "—"}, Message: ${res.message}`,
        );
      },
    );

    test(
      "supported===false → concierge acknowledges the limitation and routes appropriately",
      { timeout: TURN_TIMEOUT_MS + 5_000 },
      async () => {
        _testOverrides.impl = async () => ({
          supported: false,
          source: "https://docs.claude.com/capabilities",
          checked_at: new Date().toISOString(),
        });

        const res = await runChat(GATE3_HISTORY);

        assert.ok(
          ["chat", "handoff", "register"].includes(res.stage),
          `invalid stage: ${res.stage}`,
        );
        assert.ok(
          typeof res.message === "string" && res.message.length > 0,
          "must return a non-empty message",
        );

        // The concierge must acknowledge the confirmed limitation or adapt the
        // routing accordingly (manual-first path, alternative tool, or source
        // note) rather than silently ignoring it.
        const lower = res.message.toLowerCase();
        const acknowledgesLimitationOrAdapts =
          lower.includes("not support") ||
          lower.includes("cannot") ||
          lower.includes("can't") ||
          lower.includes("limitation") ||
          lower.includes("manual") ||
          lower.includes("alternative") ||
          lower.includes("workaround") ||
          lower.includes("instead") ||
          res.recommendedBuilder === "manual" ||
          res.recommendedBuilder === "claude-skill";

        assert.ok(
          acknowledgesLimitationOrAdapts,
          `When supported===false the concierge should acknowledge the limitation or route accordingly. Stage: ${res.stage}, Builder: ${res.recommendedBuilder ?? "—"}, Message: ${res.message}`,
        );
      },
    );

    test(
      'supported==="unknown" → message flags the capability claim as unverified',
      { timeout: TURN_TIMEOUT_MS + 5_000 },
      async () => {
        _testOverrides.impl = async () => ({
          supported: "unknown",
          source: "",
          checked_at: new Date().toISOString(),
        });

        const res = await runChat(GATE3_HISTORY);

        assert.ok(
          ["chat", "handoff", "register"].includes(res.stage),
          `invalid stage: ${res.stage}`,
        );

        const lower = res.message.toLowerCase();

        // When the live check is inconclusive, the system prompt instructs the
        // concierge to explicitly flag the claim as unverified with phrases like
        // "I'm not certain" or "worth a quick check".
        const flagsUncertainty =
          lower.includes("not certain") ||
          lower.includes("worth a quick check") ||
          lower.includes("worth checking") ||
          lower.includes("unverified") ||
          lower.includes("not sure") ||
          lower.includes("unclear") ||
          lower.includes("might") ||
          lower.includes("may not") ||
          lower.includes("double") ||
          lower.includes("verify") ||
          lower.includes("confirm");

        assert.ok(
          flagsUncertainty,
          `When supported==="unknown" the message must flag the claim as unverified. Stage: ${res.stage}, Message: ${res.message}`,
        );

        // It must NOT assert a flat, unhedged limitation.
        const assertsFlatly =
          (lower.includes("can't") ||
            lower.includes("cannot") ||
            lower.includes("doesn't support") ||
            lower.includes("not support")) &&
          !lower.includes("not certain") &&
          !lower.includes("worth a quick check") &&
          !lower.includes("actually") &&
          !lower.includes("can generate") &&
          !lower.includes("does support") &&
          !lower.includes("might") &&
          !lower.includes("may");

        assert.ok(
          !assertsFlatly,
          `When supported==="unknown" the concierge must not assert a flat unverified limitation. Stage: ${res.stage}, Message: ${res.message}`,
        );
      },
    );
  },
);

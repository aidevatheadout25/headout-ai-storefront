/**
 * Regression: a build-shaped ask must hand off to the critique agent
 * (`runScopeChat`) immediately after search, whenever the catalogue has no
 * *strong* match — not only when it has zero results. A near-miss (a related
 * tool below MIN_MATCH_SIMILARITY) must not leave the concierge holding the
 * conversation and running its own scoping interview.
 *
 * These stub `searchCatalogue` via catalogue.ts's `_testOverrides.searchImpl`
 * seam (mirrors verifyCapability.ts's `_testOverrides.impl`) so the routing
 * decision — strong match vs. near-miss vs. zero results — is deterministic
 * and independent of live embeddings. The concierge and critique agent still
 * run the real Anthropic call, so assertions only ever check `stage` /
 * `searchContext`, never message phrasing.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 * Requires: ANTHROPIC_API_KEY. Skipped automatically when absent.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { _testOverrides as catalogueOverrides, type ApiTool } from "../lib/catalogue";
import { runChat, _testOverrides as chatAgentOverrides } from "../lib/chatAgent";

const AI_READY = !!(
  process.env.ANTHROPIC_API_KEY ||
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
);

const NEAR_MISS_TOOL: ApiTool = {
  id: "near-miss-tool-id",
  name: "Applicant Digest Bot",
  oneLiner: "Posts a daily Slack digest of new job applicants.",
  description: "Posts a daily Slack digest of new job applicants.",
  types: ["slack-bot"],
  link: "https://internal.headout.dev/tools/applicant-digest-bot",
  owner: { name: "Test Owner", slackId: "" },
  team: "Platform",
  tags: ["hr", "slack"],
  accessLevel: "internal",
  sensitive: false,
  writeCapable: false,
  ownerInstructions: "",
  status: "active",
  approvalStatus: "approved",
  submittedBy: "test",
  usageStats: { views: 0, clicks: 0, helpful: 0 },
  lastUpdated: new Date(0).toISOString(),
  lastUsed: new Date(0).toISOString(),
  ownerConfirmed: true,
  source: "seed",
  visibility: "org",
  claimed: true,
  similarity: 0.25, // below MIN_MATCH_SIMILARITY (0.38) — a near-miss, not a match
};

const STRONG_TOOL: ApiTool = {
  ...NEAR_MISS_TOOL,
  id: "strong-match-tool-id",
  name: "Candidate Sourcing Pipeline",
  oneLiner: "Sources and ranks HR candidates from a shared spreadsheet.",
  description: "Sources and ranks HR candidates from a shared spreadsheet.",
  similarity: 0.85, // above the threshold — a genuine match
};

const BUILD_ASK = "I want to build a tool that sources HR candidates from a spreadsheet";

/** Indirection so TS doesn't (incorrectly) narrow the mutable field across the `await`. */
function getLastScopeSearchContext(): typeof chatAgentOverrides.lastScopeSearchContext {
  return chatAgentOverrides.lastScopeSearchContext;
}

after(() => {
  catalogueOverrides.searchImpl = null;
});

describe(
  "build-shaped handoff routing",
  { skip: AI_READY ? false : "ANTHROPIC_API_KEY not set" },
  () => {
    test(
      "near-miss (below strong threshold) hands off to scope with the near-miss attached, no concierge interview",
      { timeout: 60_000 },
      async () => {
        catalogueOverrides.searchImpl = async () => [NEAR_MISS_TOOL];
        chatAgentOverrides.lastScopeSearchContext = null;

        const res = await runChat([{ role: "user", content: BUILD_ASK }]);

        assert.equal(
          res.stage,
          "scope",
          `expected immediate handoff to stage "scope" for a build-shaped ask with only a near-miss, got "${res.stage}"`,
        );

        // Proves the concierge did not run its own interview turn: the near
        // misses that reached the critique agent are exactly what the (single)
        // search call returned, captured before any scoping question was asked.
        const scopeCtx = getLastScopeSearchContext();
        assert.ok(scopeCtx, "expected the handoff to record a searchContext");
        assert.ok(
          scopeCtx.nearMisses.length > 0,
          "expected the near-miss tool to travel with the handoff as searchContext.nearMisses",
        );
        assert.ok(
          scopeCtx.nearMisses.some((t) => t.name === NEAR_MISS_TOOL.name),
          "expected the specific near-miss tool to be present in searchContext.nearMisses",
        );
      },
    );

    test(
      "strong match returns the match, no handoff to scope",
      { timeout: 60_000 },
      async () => {
        catalogueOverrides.searchImpl = async () => [STRONG_TOOL];

        const res = await runChat([{ role: "user", content: BUILD_ASK }]);

        assert.notEqual(
          res.stage,
          "scope",
          `expected no handoff when a strong match exists, got stage "${res.stage}"`,
        );
      },
    );

    test(
      "zero results still routes to scope (preserve existing behaviour)",
      { timeout: 60_000 },
      async () => {
        catalogueOverrides.searchImpl = async () => [];

        const res = await runChat([{ role: "user", content: BUILD_ASK }]);

        assert.equal(
          res.stage,
          "scope",
          `expected handoff to stage "scope" when search returns zero results, got "${res.stage}"`,
        );
      },
    );
  },
);

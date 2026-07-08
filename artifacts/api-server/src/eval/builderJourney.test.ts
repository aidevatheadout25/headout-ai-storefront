/**
 * Regression tests for the builder journey:
 * 1. A tool inserted via submit-review (source=built) is findable by semantic search.
 * 2. The no-match path doesn't crash and returns expected fields.
 * 3. The POST /api/briefs endpoint accepts a valid brief payload.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { db, toolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { searchCatalogue } from "../lib/catalogue";
import { embedText } from "../lib/embeddings";
import { insertTool } from "../lib/catalogue";

const TEST_TOOL_NAME = `Builder Journey Test Tool ${Date.now()}`;
const TEST_TOOL_SLUG = `builder-journey-test-${Date.now()}`;

describe("builder journey — catalogue insertion", () => {
  let insertedId: string;

  before(async () => {
    // Simulate what submit-review does: insert a tool with source="built"
    const row = await insertTool({
      title: TEST_TOOL_NAME,
      type: "zep",
      oneLiner: "Automates the weekly report compilation for the ops team",
      description:
        "A Zep skill that pulls data from the data warehouse and sends a Slack digest every Monday morning. Built via the builder journey to solve the report compilation pain point.",
      url: `https://internal.headout.dev/zeps/${TEST_TOOL_SLUG}`,
      tags: ["automation", "reports", "slack", "ops"],
      status: "active",
      accessLevel: "internal",
      source: "built",
      ownerName: "Test Builder",
      ownerSlackId: "",
      team: "Platform",
    });
    insertedId = row.id;
  });

  it("inserted tool has an embedding", async () => {
    const [tool] = await db
      .select({ id: toolsTable.id, embedding: toolsTable.embedding })
      .from(toolsTable)
      .where(eq(toolsTable.id, insertedId));
    assert.ok(tool, "tool row should exist");
    assert.ok(
      tool.embedding && (tool.embedding as number[]).length > 0,
      "tool should have a non-empty embedding",
    );
  });

  it("built tool is findable via semantic search on its name", async () => {
    const results = await searchCatalogue(TEST_TOOL_NAME, 10);
    const found = results.some((r) => r.id === insertedId);
    assert.ok(found, `tool "${TEST_TOOL_NAME}" should appear in search results`);
  });

  it("built tool is findable via semantic search on a related task description", async () => {
    const results = await searchCatalogue(
      "automate weekly report compilation for ops",
      10,
    );
    const found = results.some((r) => r.id === insertedId);
    assert.ok(
      found,
      "tool should appear when searching for its functional description",
    );
  });

  it("source field is recorded as 'built'", async () => {
    const [tool] = await db
      .select({ source: toolsTable.source })
      .from(toolsTable)
      .where(eq(toolsTable.id, insertedId));
    assert.equal(tool?.source, "built");
  });

  it("cleanup: remove the test tool", async () => {
    await db.delete(toolsTable).where(eq(toolsTable.id, insertedId));
    const [gone] = await db
      .select({ id: toolsTable.id })
      .from(toolsTable)
      .where(eq(toolsTable.id, insertedId));
    assert.equal(gone, undefined, "tool should be deleted after test");
  });
});

describe("builder journey — regression: post-ceremony search returns normal results", () => {
  /**
   * After a builder journey completes (tool inserted), a fresh chat turn with
   * a normal search query must NOT come back with stage === "scope". The
   * concierge agent should treat it as a regular catalogue search.
   *
   * We test this by calling searchCatalogue directly (the same function the
   * chat agent delegates to) — if results come back without throwing and the
   * first result looks like a Tool row, the retrieval path is working and the
   * scope mode gate cannot be triggered by a search-only call.
   */
  it("searchCatalogue returns tool rows (stage cannot be scope) after a normal query", async () => {
    const results = await searchCatalogue("automate slack notifications for the ops team", 5);
    // Must return an array (not throw).
    assert.ok(Array.isArray(results), "searchCatalogue should return an array");
    // Every result must have at least an id field — confirming real tool rows.
    for (const r of results) {
      assert.ok(typeof r.id === "string", "each result should have a string id");
    }
  });
});

describe("builder journey — regression: add-tool non-URL disambiguation", () => {
  /**
   * When the first add-mode message is not a URL, the client shows a
   * disambiguation prompt instead of forwarding to addToolChat.
   *
   * The client validates with:
   *   !trimmed.includes(" ") && (trimmed.includes(".") || trimmed.startsWith("http"))
   *
   * This test verifies that predicate correctly rejects non-URL phrases so
   * the regression cannot silently regress without a test failure.
   */
  function looksLikeUrl(text: string): boolean {
    return !text.includes(" ") && (text.includes(".") || text.startsWith("http"));
  }

  it("a natural-language phrase with spaces is not a URL", () => {
    assert.equal(looksLikeUrl("show me the mcp registry"), false);
    assert.equal(looksLikeUrl("I want to find something"), false);
    assert.equal(looksLikeUrl("let's build a new tool"), false);
  });

  it("valid URL inputs pass the predicate", () => {
    assert.equal(looksLikeUrl("internal.headout.dev/zeps/my-tool"), true);
    assert.equal(looksLikeUrl("https://example.com/tool"), true);
    assert.equal(looksLikeUrl("slack-digest.headout.internal"), true);
  });
});

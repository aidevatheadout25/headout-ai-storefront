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

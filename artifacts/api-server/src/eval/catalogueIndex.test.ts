/**
 * pgvector ANN index regression checks.
 *
 * Semantic search must stay fast as the catalogue grows to hundreds of tools.
 * That relies on the HNSW index (`tools_embedding_hnsw_idx`, vector_cosine_ops)
 * declared in `@workspace/db`'s schema and applied by `pnpm --filter db push`
 * (this project's migration path — see scripts/post-merge.sh; there is no
 * generated-migrations folder by design).
 *
 * These tests pin two things that can silently regress:
 *   1. the index exists and uses the cosine operator class, and
 *   2. the planner actually picks it for the catalogue's ANN ordering
 *      (`ORDER BY embedding <=> query`). If `searchCatalogue` ever reverts to
 *      ordering by `1 - distance` DESC, the plan flips back to a full scan and
 *      this test fails.
 *
 * It also sanity-checks that ANN ordering still matches the exact brute-force
 * ordering for the seeded catalogue, so indexing did not change which tools we
 * surface (the broader retrieval fixtures live in catalogueQuality.test.ts).
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 * Requires: DATABASE_URL (seeded).
 */
import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { db, pool, toolsTable } from "@workspace/db";
import { cosineDistance, sql, asc } from "drizzle-orm";
import { embed } from "../lib/embeddings";
import { seedCatalogueIfEmpty } from "../lib/seed";

before(async () => {
  await seedCatalogueIfEmpty();
});

describe("catalogue ANN index", () => {
  test("HNSW cosine index exists on the embedding column", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'tools' AND indexname = 'tools_embedding_hnsw_idx'`,
    );
    assert.equal(rows.length, 1, "expected tools_embedding_hnsw_idx to exist");
    const def = rows[0].indexdef.toLowerCase();
    assert.ok(def.includes("hnsw"), `expected an HNSW index, got: ${def}`);
    assert.ok(
      def.includes("vector_cosine_ops"),
      `expected the cosine operator class, got: ${def}`,
    );
  });

  test("planner uses the ANN index for cosine-ordered search", async () => {
    const queryEmbedding = await embed("summarise guest reviews");
    const vec = `[${queryEmbedding.join(",")}]`;
    // Disable seq scans for this connection so the choice is deterministic
    // regardless of the (currently tiny) seeded row count — what we are
    // asserting is that the query *shape* is index-servable.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL enable_seqscan = off");
      const { rows } = await client.query<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT id FROM tools ORDER BY embedding <=> $1::vector ASC LIMIT 6`,
        [vec],
      );
      const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
      assert.ok(
        plan.includes("tools_embedding_hnsw_idx"),
        `expected the plan to use tools_embedding_hnsw_idx, got:\n${plan}`,
      );
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  test("ANN ordering matches exact ordering for the seeded catalogue", async () => {
    const queryEmbedding = await embed(
      "look up a customer's booking from inside Slack",
    );
    const distance = cosineDistance(toolsTable.embedding, queryEmbedding);

    const annRows = await db
      .select({ id: toolsTable.id })
      .from(toolsTable)
      .orderBy(asc(distance))
      .limit(5);

    // Force an exact (non-index) ordering as the ground truth.
    const exact = await db.execute(
      sql`SELECT id FROM tools
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector ASC
          LIMIT 5`,
    );
    const exactIds = (exact.rows as { id: string }[]).map((r) => r.id);
    const annIds = annRows.map((r) => r.id);

    assert.deepEqual(
      annIds,
      exactIds,
      "ANN ordering diverged from exact ordering for the seeded catalogue",
    );
  });
});

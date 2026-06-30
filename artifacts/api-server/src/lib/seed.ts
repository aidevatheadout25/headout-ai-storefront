import { db, toolsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { embedMany, warmEmbeddings } from "./embeddings";
import { toolEmbeddingText, countTools } from "./catalogue";
import { normalizeUrl } from "./normalizeUrl";
import { SEED_TOOLS } from "./seedData";
import { logger } from "./logger";

/**
 * Backfill integrity columns for rows that predate the dedup/verification
 * feature. Idempotent and cheap (no-op once everything is populated), so it is
 * safe to run on every startup — this is how existing/production data picks up
 * `normalized_url` (required for dedup to work) and gets curated rows marked
 * verified.
 */
export async function backfillCatalogueIntegrity(): Promise<void> {
  // 1. Populate normalized_url for any row missing it but with a real URL.
  const missing = await db
    .select({ id: toolsTable.id, url: toolsTable.url })
    .from(toolsTable)
    .where(and(eq(toolsTable.normalizedUrl, ""), sql`${toolsTable.url} <> ''`));

  for (const row of missing) {
    await db
      .update(toolsTable)
      .set({ normalizedUrl: normalizeUrl(row.url) })
      .where(eq(toolsTable.id, row.id));
  }

  // 2. Mark curated (seed / zeps-sync) rows verified — these are trusted and
  //    predate the `verified` column, which defaults to false.
  const verifiedResult = await db
    .update(toolsTable)
    .set({ verified: true })
    .where(
      and(
        eq(toolsTable.verified, false),
        inArray(toolsTable.source, ["seed", "zeps-sync"]),
      ),
    )
    .returning({ id: toolsTable.id });

  if (missing.length > 0 || verifiedResult.length > 0) {
    logger.info(
      { normalizedUrls: missing.length, verified: verifiedResult.length },
      "Backfilled catalogue integrity columns",
    );
  }
}

/**
 * Idempotent seed: if the catalogue is empty, embed and insert the curated set.
 * If it already has rows, just warm the embedding model in the background so the
 * first search/chat request isn't slow.
 */
export async function seedCatalogueIfEmpty(): Promise<void> {
  const existing = await countTools();
  if (existing > 0) {
    logger.info({ existing }, "Catalogue already seeded; skipping");
    // Bring pre-existing rows up to date with the dedup/verification columns.
    await backfillCatalogueIntegrity().catch((err) =>
      logger.error({ err }, "Catalogue integrity backfill failed"),
    );
    void warmEmbeddings().catch((err) =>
      logger.warn({ err }, "Embedding warmup failed"),
    );
    return;
  }

  logger.info({ count: SEED_TOOLS.length }, "Seeding catalogue…");
  const texts = SEED_TOOLS.map((tool) =>
    toolEmbeddingText({
      title: tool.title,
      oneLiner: tool.oneLiner ?? undefined,
      description: tool.description ?? undefined,
      tags: tool.tags ?? undefined,
      type: tool.type,
    }),
  );
  const embeddings = await embedMany(texts);
  const rows = SEED_TOOLS.map((tool, i) => ({
    ...tool,
    // Curated seed entries are trusted/owned, so they are verified out of the box.
    verified: true,
    normalizedUrl: normalizeUrl(tool.url ?? ""),
    embedding: embeddings[i],
  }));
  await db.insert(toolsTable).values(rows);
  logger.info({ count: rows.length }, "Catalogue seeded");
}

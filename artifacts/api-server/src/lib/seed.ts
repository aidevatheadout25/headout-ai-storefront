import { db, toolsTable } from "@workspace/db";
import { embedMany, warmEmbeddings } from "./embeddings";
import { toolEmbeddingText, countTools } from "./catalogue";
import { SEED_TOOLS } from "./seedData";
import { logger } from "./logger";

/**
 * Idempotent seed: if the catalogue is empty, embed and insert the curated set.
 * If it already has rows, just warm the embedding model in the background so the
 * first search/chat request isn't slow.
 */
export async function seedCatalogueIfEmpty(): Promise<void> {
  const existing = await countTools();
  if (existing > 0) {
    logger.info({ existing }, "Catalogue already seeded; skipping");
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
  const rows = SEED_TOOLS.map((tool, i) => ({ ...tool, embedding: embeddings[i] }));
  await db.insert(toolsTable).values(rows);
  logger.info({ count: rows.length }, "Catalogue seeded");
}

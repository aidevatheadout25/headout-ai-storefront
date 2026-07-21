/**
 * Destructive-refresh script: replaces every row in the catalogue with the
 * real, GitHub-audited Headout tools in lib/realSeedData.ts. Shares the same
 * data source as boot seeding (seedCatalogueIfEmpty() in lib/seed.ts also seeds
 * ALL_REAL_SEED_TOOLS) — the difference is intent: boot is idempotent
 * seed-if-empty, this always wipes first so it can refresh a DB that already
 * holds an older/stale catalogue.
 *
 * Run from artifacts/api-server: `pnpm run seed:real`
 * Requires DATABASE_URL to point at the target Postgres instance.
 */
import { db, pool, toolsTable } from "@workspace/db";
import { embedMany } from "../lib/embeddings";
import { toolEmbeddingText } from "../lib/catalogue";
import { normalizeUrl } from "../lib/normalizeUrl";
import { ALL_REAL_SEED_TOOLS } from "../lib/realSeedData";
import { logger } from "../lib/logger";

async function main() {
  const before = await db.select().from(toolsTable);
  logger.info(
    { existingRows: before.length, incomingRows: ALL_REAL_SEED_TOOLS.length },
    "Wiping tools table and reseeding with real Headout tools…",
  );

  await db.delete(toolsTable);

  const texts = ALL_REAL_SEED_TOOLS.map((tool) =>
    toolEmbeddingText({
      title: tool.title,
      oneLiner: tool.oneLiner ?? undefined,
      description: tool.description ?? undefined,
      tags: tool.tags ?? undefined,
      type: tool.type,
    }),
  );
  const embeddings = await embedMany(texts);

  const rows = ALL_REAL_SEED_TOOLS.map((tool, i) => ({
    ...tool,
    verified: true,
    normalizedUrl: normalizeUrl(tool.url ?? ""),
    embedding: embeddings[i],
  }));

  await db.insert(toolsTable).values(rows);

  logger.info({ count: rows.length }, "Real catalogue seeded");
}

main()
  .catch((err) => {
    logger.error({ err }, "seed:real failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

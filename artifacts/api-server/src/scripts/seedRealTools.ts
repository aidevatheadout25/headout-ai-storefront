/**
 * One-off, run-it-yourself script: replaces every row in the catalogue with
 * the real, GitHub-audited Headout tools in lib/realSeedData.ts. Unlike
 * seedCatalogueIfEmpty() (which only seeds an empty table on app boot), this
 * always wipes first — it exists specifically to cut a DB that already holds
 * the fictional demo catalogue (lib/seedData.ts) over to real data.
 *
 * Deliberately does NOT touch lib/seedData.ts / seed.ts: those fictional rows
 * are also the eval harness's regression fixtures (see
 * eval/catalogueQuality.test.ts, which asserts retrieval quality by exact
 * fictional tool name). Swapping that wiring is a separate, deliberate change
 * — not something to fold into a data-seeding script.
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

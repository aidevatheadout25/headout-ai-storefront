/**
 * Ensure the pgvector extension exists before the schema is pushed.
 *
 * The `tools.embedding` column is `vector(384)` with an HNSW cosine index, so
 * the `vector` type must exist before `drizzle-kit push` creates the table.
 * drizzle-kit does not manage extensions, so we create it here. Idempotent —
 * safe to run on every deploy. Requires DATABASE_URL and a Postgres image that
 * bundles pgvector (e.g. Railway Postgres or the pgvector/pgvector image).
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to ensure the pgvector extension.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
  console.log("pgvector extension ensured.");
} finally {
  await client.end();
}

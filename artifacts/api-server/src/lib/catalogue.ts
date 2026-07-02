import {
  db,
  toolsTable,
  toolFlagsTable,
  accessRequestsTable,
  type ToolRow,
  type InsertTool,
} from "@workspace/db";
import { and, asc, cosineDistance, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { embed } from "./embeddings";
import { normalizeUrl } from "./normalizeUrl";

/**
 * The JSON shape the frontend renders. It is intentionally a superset of the
 * DB row: fields the v1 catalogue does not model (approval, usage, sensitivity)
 * are filled with stable defaults so the existing card / detail components keep
 * working without per-field plumbing.
 */
export type ApiTool = {
  id: string;
  name: string;
  oneLiner: string;
  description: string;
  types: string[];
  link: string;
  owner: { name: string; slackId: string };
  team: string;
  tags: string[];
  accessLevel: string;
  sensitive: boolean;
  writeCapable: boolean;
  ownerInstructions: string;
  status: string;
  approvalStatus: "approved";
  submittedBy: string;
  usageStats: { views: number; clicks: number; helpful: number };
  lastUpdated: string;
  lastUsed: string;
  ownerConfirmed: boolean;
  source: string;
  visibility: string;
  /** True once an owner has claimed the listing (has a manage key). */
  claimed: boolean;
  similarity?: number;
};

/**
 * Visibility seam. v1 ships every tool as `org`-visible, but routing all reads
 * through this predicate gives SSO/visibility a single place to land later.
 */
export function canView(
  row: Pick<ToolRow, "visibility">,
  _viewer?: { orgId?: string },
): boolean {
  return row.visibility !== "private";
}

export function rowToApiTool(row: ToolRow): ApiTool {
  const updated = row.updatedAt.toISOString();
  return {
    id: row.id,
    name: row.title,
    oneLiner: row.oneLiner,
    description: row.description,
    types: [row.type],
    link: row.url,
    owner: { name: row.ownerName || "Unknown", slackId: row.ownerSlackId },
    team: row.team,
    tags: row.tags ?? [],
    accessLevel: row.accessLevel,
    sensitive: false,
    writeCapable: false,
    ownerInstructions: "",
    status: row.status,
    approvalStatus: "approved",
    submittedBy: row.ownerName,
    usageStats: { views: 0, clicks: 0, helpful: 0 },
    lastUpdated: updated,
    lastUsed: updated,
    ownerConfirmed: row.verified,
    source: row.source,
    visibility: row.visibility,
    claimed: Boolean(row.manageTokenHash),
  };
}

/** Compose the text that gets embedded for a tool. */
export function toolEmbeddingText(input: {
  title: string;
  oneLiner?: string;
  description?: string;
  tags?: string[];
  type?: string;
}): string {
  return [
    input.title,
    input.oneLiner,
    input.description,
    (input.tags ?? []).join(", "),
    input.type,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(". ");
}

/**
 * Minimum cosine similarity for a catalogue row to count as a *good* match.
 *
 * Below this, a result is only loosely related to the ask and must be treated
 * as "no match" rather than confidently recommended. Tuned against the seeded
 * catalogue: every positive retrieval fixture scores >= ~0.42 for its intended
 * tool, while off-catalogue / loosely-related asks top out around ~0.32, so a
 * threshold in the gap separates real matches from weak ones with margin on
 * both sides. See `eval/catalogueQuality.test.ts` for the regression fixtures.
 */
export const MIN_MATCH_SIMILARITY = 0.38;

/**
 * Semantic search: embed the query, rank rows by cosine similarity in pgvector.
 * This is the single tool the chat agent can call.
 */
export async function searchCatalogue(
  query: string,
  k = 6,
): Promise<ApiTool[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryEmbedding = await embed(trimmed);
  // Order by the raw cosine distance ascending (smaller = closer). This is the
  // bare `embedding <=> query` form the pgvector HNSW (vector_cosine_ops) index
  // can serve — ordering by `1 - distance` DESC would defeat the index. We still
  // project `similarity = 1 - distance` so callers keep a 0..1 score.
  const distance = cosineDistance(toolsTable.embedding, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await db
    .select({ ...getTableColumns(toolsTable), similarity })
    .from(toolsTable)
    .orderBy(asc(distance))
    .limit(k);

  return rows
    .filter((row) => canView(row))
    .map(({ similarity: score, ...row }) => ({
      ...rowToApiTool(row as ToolRow),
      similarity: score,
    }));
}

export async function listTools(
  opts: { type?: string } = {},
): Promise<ApiTool[]> {
  const where = opts.type ? eq(toolsTable.type, opts.type) : undefined;
  const rows = await db
    .select()
    .from(toolsTable)
    .where(where ? and(where) : undefined)
    .orderBy(desc(toolsTable.updatedAt));
  return rows.filter((row) => canView(row)).map(rowToApiTool);
}

/** List tools filtered by team and/or type — for chat browsing. */
export async function listToolsByFilter(opts: {
  type?: string;
  team?: string;
  limit?: number;
} = {}): Promise<ApiTool[]> {
  const conditions = [];
  if (opts.type) conditions.push(eq(toolsTable.type, opts.type));
  if (opts.team) conditions.push(eq(toolsTable.team, opts.team));

  const rows = await db
    .select()
    .from(toolsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(toolsTable.updatedAt))
    .limit(opts.limit ?? 20);

  return rows.filter((row) => canView(row)).map(rowToApiTool);
}

/** Record a user-reported issue with a tool. */
export async function insertToolFlag(data: {
  toolId: string;
  reason: string;
  details?: string;
  reporterEmail?: string;
}): Promise<void> {
  await db.insert(toolFlagsTable).values({
    toolId: data.toolId,
    reason: data.reason,
    details: data.details ?? "",
    reporterEmail: data.reporterEmail ?? "",
  });
}

/** Record a user access request for a restricted tool. */
export async function insertAccessRequest(data: {
  toolId: string;
  reason: string;
  requesterEmail?: string;
}): Promise<void> {
  await db.insert(accessRequestsTable).values({
    toolId: data.toolId,
    reason: data.reason,
    requesterEmail: data.requesterEmail ?? "",
  });
}

/** Constant-time comparison of a plaintext manage token against a tool's stored hash. */
export function verifyManageToken(row: ToolRow, token: string | undefined): boolean {
  if (!token || !row.manageTokenHash) return false;
  const aBuf = Buffer.from(hashManageToken(token));
  const bBuf = Buffer.from(row.manageTokenHash);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * Look up an existing tool by the canonical form of a URL. Used to dedup
 * submissions so the same link can't create two catalogue entries.
 */
export async function findToolByUrl(url: string): Promise<ApiTool | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(toolsTable)
    .where(eq(toolsTable.normalizedUrl, normalized))
    .limit(1);
  const row = rows[0];
  if (!row || !canView(row)) return null;
  return rowToApiTool(row);
}

export async function getToolById(id: string): Promise<ApiTool | null> {
  const rows = await db
    .select()
    .from(toolsTable)
    .where(eq(toolsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || !canView(row)) return null;
  return rowToApiTool(row);
}

/**
 * Raw row including `manageTokenHash` — for owner-auth checks only. Never map
 * this straight to the client; go through {@link rowToApiTool}.
 */
export async function getToolRowById(id: string): Promise<ToolRow | null> {
  const rows = await db
    .select()
    .from(toolsTable)
    .where(eq(toolsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Editable fields an owner/admin may patch on a tool. */
export type ToolPatch = Partial<{
  type: string;
  title: string;
  oneLiner: string;
  description: string;
  tags: string[];
  ownerName: string;
  ownerSlackId: string;
  team: string;
  url: string;
  status: string;
  accessLevel: string;
}>;

/** Fields whose change must trigger a fresh embedding so search stays accurate. */
const EMBEDDING_FIELDS = [
  "title",
  "oneLiner",
  "description",
  "tags",
  "type",
] as const;

/**
 * Apply an owner/admin edit. Re-embeds whenever an embedding-relevant field
 * changes so semantic search reflects the new metadata. Returns null if the
 * tool no longer exists.
 */
export async function updateTool(
  id: string,
  patch: ToolPatch,
): Promise<ApiTool | null> {
  const existing = await getToolRowById(id);
  if (!existing) return null;

  const merged = { ...existing, ...patch };
  const values: Record<string, unknown> = { ...patch, updatedAt: new Date() };

  const embeddingChanged = EMBEDDING_FIELDS.some(
    (field) => patch[field] !== undefined,
  );
  if (embeddingChanged) {
    values.embedding = await embed(
      toolEmbeddingText({
        title: merged.title,
        oneLiner: merged.oneLiner,
        description: merged.description,
        tags: merged.tags,
        type: merged.type,
      }),
    );
  }

  const [row] = await db
    .update(toolsTable)
    .set(values)
    .where(eq(toolsTable.id, id))
    .returning();
  return row ? rowToApiTool(row) : null;
}

/**
 * Set the owner and (re)issue a manage key. Returns the updated tool plus the
 * plaintext manage token — shown to the claimer exactly once; only its hash is
 * stored.
 */
export async function claimTool(
  id: string,
  owner: { ownerName: string; ownerSlackId: string },
): Promise<{ tool: ApiTool; manageToken: string } | null> {
  const manageToken = randomBytes(24).toString("hex");
  const [row] = await db
    .update(toolsTable)
    .set({
      ownerName: owner.ownerName,
      ownerSlackId: owner.ownerSlackId,
      manageTokenHash: hashManageToken(manageToken),
      updatedAt: new Date(),
    })
    .where(eq(toolsTable.id, id))
    .returning();
  if (!row) return null;
  return { tool: rowToApiTool(row), manageToken };
}

/**
 * Thrown when an insert loses the race against a concurrent submission of the
 * same URL (DB unique violation). Carries the existing tool so the caller can
 * return it as a duplicate instead of a 500.
 */
export class DuplicateToolError extends Error {
  tool: ApiTool;
  constructor(tool: ApiTool) {
    super("Tool with this URL already exists");
    this.name = "DuplicateToolError";
    this.tool = tool;
  }
}

/** Postgres unique-violation error code. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

export async function insertTool(
  data: Omit<InsertTool, "embedding">,
): Promise<ApiTool> {
  const embedding = await embed(
    toolEmbeddingText({
      title: data.title,
      oneLiner: data.oneLiner ?? undefined,
      description: data.description ?? undefined,
      tags: data.tags ?? undefined,
      type: data.type,
    }),
  );
  const url = data.url ?? "";
  try {
    const [row] = await db
      .insert(toolsTable)
      .values({ ...data, normalizedUrl: normalizeUrl(url), embedding })
      .returning();
    return rowToApiTool(row);
  } catch (err) {
    // Lost the race: a concurrent request inserted the same normalized URL.
    // Surface the existing row as a duplicate rather than failing.
    if (isUniqueViolation(err)) {
      const existing = await findToolByUrl(url);
      if (existing) throw new DuplicateToolError(existing);
    }
    throw err;
  }
}

/**
 * Zeps sync stub. The real integration would pull live Zep agents from the
 * Zeps runtime; for v1 this returns the seeded `zep`-type rows so the rest of
 * the app can treat Zeps as just another catalogue source.
 */
export async function getZepsTools(): Promise<ApiTool[]> {
  return listTools({ type: "zep" });
}

/**
 * Distinct catalogue tags ordered by frequency (most common first). Read-only;
 * used to bias the add-tool LLM toward reusing existing facets instead of
 * minting near-synonyms. Aggregated in JS — the catalogue is small and this
 * keeps the unnest/group-by off the hot search path.
 */
export async function fetchTagVocabulary(): Promise<string[]> {
  const rows = await db.select({ tags: toolsTable.tags }).from(toolsTable);
  const freq = new Map<string, number>();
  for (const row of rows) {
    for (const raw of row.tags ?? []) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

export async function countTools(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(toolsTable);
  return count ?? 0;
}

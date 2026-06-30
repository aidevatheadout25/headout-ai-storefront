import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const EMBEDDING_DIMENSIONS = 384;

/**
 * The single source of truth for the catalogue.
 *
 * `embedding` holds a 384-dim vector (all-MiniLM-L6-v2) used for semantic
 * search via pgvector cosine distance. `source` tracks provenance
 * (seed | manual | zeps-sync) and `visibility` is the SSO/visibility seam
 * (default 'org').
 */
export const toolsTable = pgTable("tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  oneLiner: text("one_liner").notNull().default(""),
  description: text("description").notNull().default(""),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  ownerName: text("owner_name").notNull().default(""),
  ownerSlackId: text("owner_slack_id").notNull().default(""),
  team: text("team").notNull().default("Platform"),
  url: text("url").notNull().default(""),
  source: text("source").notNull().default("manual"),
  visibility: text("visibility").notNull().default("org"),
  status: text("status").notNull().default("live"),
  accessLevel: text("access_level").notNull().default("open"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  // sha256 hex of the owner's secret manage key. Null while a tool is
  // unclaimed; set on claim. Gates owner-scoped edits — never exposed to clients.
  manageTokenHash: text("manage_token_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertToolSchema = createInsertSchema(toolsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  manageTokenHash: true,
});

export type InsertTool = z.infer<typeof insertToolSchema>;
export type ToolRow = typeof toolsTable.$inferSelect;

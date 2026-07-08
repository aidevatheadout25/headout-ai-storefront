import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { conversationsTable } from "./chats";
import { toolsTable } from "./tools";

/**
 * A requirements brief produced by the critique agent when a user decides to
 * build something. Persisted so the frontend editable card can survive page
 * reloads and the scaffold/review steps can reference it.
 */
export const briefsTable = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(
      () => conversationsTable.id,
      { onDelete: "set null" },
    ),
    searchContext: jsonb("search_context")
      .notNull()
      .default(sql`'{}'::jsonb`),
    title: text("title"),
    problem: text("problem").notNull().default(""),
    users: text("users").notNull().default(""),
    frequency: text("frequency").notNull().default(""),
    mustDo: jsonb("must_do")
      .notNull()
      .default(sql`'[]'::jsonb`),
    wontDo: jsonb("wont_do")
      .notNull()
      .default(sql`'[]'::jsonb`),
    appClass: text("app_class").notNull().default("micro"),
    risk: text("risk").notNull().default("low"),
    state: text("state").notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_briefs_conversation").on(table.conversationId, table.createdAt),
  ],
);

/**
 * A scaffold build created from a confirmed brief. Tracks checklist + review
 * state, and links to the final tool once the review passes.
 */
export const buildsTable = pgTable(
  "builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => briefsTable.id, { onDelete: "cascade" }),
    repoUrl: text("repo_url").notNull().default(""),
    checklistState: jsonb("checklist_state")
      .notNull()
      .default(sql`'{}'::jsonb`),
    reviewState: jsonb("review_state")
      .notNull()
      .default(sql`'{}'::jsonb`),
    toolId: uuid("tool_id").references(() => toolsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("IDX_builds_brief").on(table.briefId)],
);

export type BriefRow = typeof briefsTable.$inferSelect;
export type BuildRow = typeof buildsTable.$inferSelect;

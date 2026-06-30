import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * A saved concierge conversation, owned by one authenticated user. The title is
 * derived from the first user message so the history list reads well.
 */
export const conversationsTable = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("IDX_conversations_user").on(table.userId, table.updatedAt)],
);

/**
 * One turn in a conversation. `tools` stores a snapshot of the recommended tool
 * cards (the exact JSON the chat endpoint returned) so a reopened conversation
 * re-renders identically even if the catalogue later changes. `noMatch` and
 * `userQuery` capture the no-match "build / request it" state.
 */
export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    text: text("text").notNull().default(""),
    tools: jsonb("tools"),
    noMatch: boolean("no_match").notNull().default(false),
    userQuery: text("user_query"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_messages_conversation").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type ConversationRow = typeof conversationsTable.$inferSelect;
export type MessageRow = typeof messagesTable.$inferSelect;

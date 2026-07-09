import {
  db,
  conversationsTable,
  messagesTable,
  type ConversationRow,
  type MessageRow,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import type { ApiTool } from "./catalogue";
import type { BriefPayload, BuilderId, EscalatePayload, FunnelStage, KillPayload } from "./chatAgent";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ApiTool[] | null;
  noMatch: boolean;
  stage: FunnelStage;
  recommendedBuilder: BuilderId | null;
  buildPrompt: string | null;
  /** Set only when stage === "register": the captured URL, or null if not yet provided. */
  registration: { url: string | null } | null;
  briefPayload: BriefPayload | null;
  killPayload: KillPayload | null;
  escalatePayload: EscalatePayload | null;
  userQuery: string | null;
  createdAt: string;
};

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: MessageRow): SavedMessage {
  const rawStage = row.stage;
  const stage: FunnelStage =
    rawStage === "handoff"
      ? "handoff"
      : rawStage === "register"
        ? "register"
        : rawStage === "scope"
          ? "scope"
          : rawStage === "brief"
            ? "brief"
            : rawStage === "kill"
              ? "kill"
              : rawStage === "escalate"
                ? "escalate"
                : rawStage === "disambiguation"
                  ? "disambiguation"
                  : "chat";

  // brief/kill/escalate payloads are stored as a wrapper object in the tools
  // jsonb column to avoid needing a schema migration.
  const toolsRaw = row.tools as unknown;
  let briefPayload: BriefPayload | null = null;
  let killPayload: KillPayload | null = null;
  let escalatePayload: EscalatePayload | null = null;
  let tools: ApiTool[] | null = null;

  if (toolsRaw && typeof toolsRaw === "object" && !Array.isArray(toolsRaw)) {
    const payload = toolsRaw as Record<string, unknown>;
    if (stage === "brief" && payload._briefPayload) {
      briefPayload = payload._briefPayload as BriefPayload;
    } else if (stage === "kill" && payload._killPayload) {
      killPayload = payload._killPayload as KillPayload;
    } else if (stage === "escalate" && payload._escalatePayload) {
      escalatePayload = payload._escalatePayload as EscalatePayload;
    }
  } else {
    tools = (toolsRaw as ApiTool[] | null) ?? null;
  }

  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    text: row.text,
    tools,
    noMatch: row.noMatch,
    stage,
    recommendedBuilder: (row.recommendedBuilder as BuilderId | null) ?? null,
    buildPrompt: stage === "register" ? null : row.buildPrompt,
    registration: stage === "register" ? { url: row.buildPrompt ?? null } : null,
    briefPayload,
    killPayload,
    escalatePayload,
    userQuery: row.userQuery,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Derive a short, readable conversation title from the first user message. */
export function titleFromMessage(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "New chat";
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .orderBy(desc(conversationsTable.updatedAt));
  return rows.map(toSummary);
}

/**
 * Returns the conversation and its messages, but only if it belongs to the
 * given user. Returns null otherwise (not found OR not owned — never leak which).
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<{ conversation: ConversationSummary; messages: SavedMessage[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, userId),
      ),
    )
    .limit(1);
  if (!conversation) return null;

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  return {
    conversation: toSummary(conversation),
    messages: messages.map(toMessage),
  };
}

export async function createConversation(
  userId: string,
  title: string,
): Promise<ConversationSummary> {
  const [row] = await db
    .insert(conversationsTable)
    .values({ userId, title })
    .returning();
  return toSummary(row);
}

/** Confirm a conversation exists and belongs to the user. */
export async function userOwnsConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Persist a completed turn: the user message and the assistant reply (with its
 * recommended-tool snapshot / no-match state), and bump the conversation's
 * updatedAt so it floats to the top of the history list.
 *
 * When stage === "register", the captured URL is stored in build_prompt so it
 * survives a reload without a schema migration. It is reconstructed as
 * registration.url in toMessage on read.
 *
 * When stage === "brief" or "kill", the payload is stored in the tools jsonb
 * column as a wrapper object (no schema migration needed).
 */
export async function appendTurn(
  conversationId: string,
  turn: {
    userText: string;
    assistantText: string;
    tools: ApiTool[];
    noMatch: boolean;
    stage: FunnelStage;
    recommendedBuilder: BuilderId | null;
    buildPrompt: string | null;
    registration: { url: string | null } | null;
    briefPayload?: BriefPayload | null;
    killPayload?: KillPayload | null;
    escalatePayload?: EscalatePayload | null;
  },
): Promise<void> {
  // For register stage, persist the captured URL via build_prompt.
  const persistedBuildPrompt =
    turn.stage === "register"
      ? (turn.registration?.url ?? null)
      : turn.buildPrompt;

  // Store brief/kill/escalate payloads in the tools jsonb column as a wrapper.
  let toolsToStore: unknown = turn.tools;
  if (turn.stage === "brief" && turn.briefPayload) {
    toolsToStore = { _briefPayload: turn.briefPayload };
  } else if (turn.stage === "kill" && turn.killPayload) {
    toolsToStore = { _killPayload: turn.killPayload };
  } else if (turn.stage === "escalate" && turn.escalatePayload) {
    toolsToStore = { _escalatePayload: turn.escalatePayload };
  }

  await db.insert(messagesTable).values([
    {
      conversationId,
      role: "user",
      text: turn.userText,
    },
    {
      conversationId,
      role: "assistant",
      text: turn.assistantText,
      tools: toolsToStore as Record<string, unknown>[],
      noMatch: turn.noMatch,
      stage: turn.stage,
      recommendedBuilder: turn.recommendedBuilder,
      buildPrompt: persistedBuildPrompt,
      userQuery: turn.userText,
    },
  ]);

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
}

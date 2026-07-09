import { Router, type IRouter, type Request, type Response } from "express";
import { runChat, type ChatTurn, type ChatUserContext } from "../lib/chatAgent";
import {
  appendTurn,
  createConversation,
  titleFromMessage,
  userOwnsConversation,
} from "../lib/conversations";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function parseHistory(body: unknown): ChatTurn[] | null {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return null;
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      turns.push({ role, content });
    }
  }
  return turns;
}

function lastUserText(history: ChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

/**
 * POST /api/chat { messages: [{role, content}], conversationId? } — runs a
 * concierge turn and saves it to the signed-in user's conversation. When no
 * conversationId is given a new conversation is created (titled from the first
 * message); the response always returns the conversationId so the client can
 * keep appending to it.
 */
router.post("/chat", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Sign in to use the chat" });
  }

  const history = parseHistory(req.body);
  if (!history || history.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const requestedId = (req.body as { conversationId?: unknown })?.conversationId;
  let conversationId: string | null =
    typeof requestedId === "string" && requestedId ? requestedId : null;

  if (conversationId) {
    const owns = await userOwnsConversation(req.user.id, conversationId);
    if (!owns) {
      return res.status(404).json({ error: "Conversation not found" });
    }
  }

  try {
    const userText = lastUserText(history);
    const bodyMode = (req.body as { mode?: unknown })?.mode;
    const bodyCtx = (req.body as { searchContext?: unknown })?.searchContext;
    const searchContext =
      bodyCtx &&
      typeof bodyCtx === "object" &&
      !Array.isArray(bodyCtx) &&
      "query" in bodyCtx
        ? (bodyCtx as { query: string; nearMisses: { name: string; oneLiner: string }[] })
        : undefined;
    const userCtx: ChatUserContext = {
      email: (req.user as { email?: string } | undefined)?.email,
      userId: req.user?.id,
      conversationId: conversationId ?? undefined,
      mode: bodyMode === "scope" ? "scope" : undefined,
      searchContext,
    };
    const result = await runChat(history, userCtx);

    if (!conversationId) {
      const conversation = await createConversation(
        req.user.id,
        titleFromMessage(userText),
      );
      conversationId = conversation.id;
    }

    await appendTurn(conversationId, {
      userText,
      assistantText: result.message,
      tools: result.tools,
      noMatch: result.noMatch,
      stage: result.stage,
      recommendedBuilder: result.recommendedBuilder,
      buildPrompt: result.buildPrompt,
      registration: result.registration,
      briefPayload: result.briefPayload,
      killPayload: result.killPayload,
      escalatePayload: result.escalatePayload,
    });

    return res.json({ ...result, conversationId });
  } catch (err) {
    logger.error({ err }, "Chat agent failed");
    return res.status(500).json({ error: "Chat failed" });
  }
});

export default router;

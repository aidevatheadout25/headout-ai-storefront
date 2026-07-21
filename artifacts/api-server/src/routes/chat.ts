import { Router, type IRouter, type Request, type Response } from "express";
import { runChat, type ChatTurn, type ChatUserContext } from "../lib/chatAgent";
import {
  appendTurn,
  createConversation,
  titleFromMessage,
  userOwnsConversation,
} from "../lib/conversations";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use(requireAuth);

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

/** Build the ChatUserContext (email/mode/searchContext) from a request body. */
function buildUserCtx(
  body: unknown,
  user: { id: string; email?: string | null },
  conversationId: string | null,
): ChatUserContext {
  const bodyMode = (body as { mode?: unknown })?.mode;
  const bodyCtx = (body as { searchContext?: unknown })?.searchContext;
  const searchContext =
    bodyCtx && typeof bodyCtx === "object" && !Array.isArray(bodyCtx) && "query" in bodyCtx
      ? (bodyCtx as { query: string; nearMisses: { name: string; oneLiner: string }[] })
      : undefined;
  return {
    email: user.email ?? undefined,
    userId: user.id,
    conversationId: conversationId ?? undefined,
    mode: bodyMode === "scope" ? "scope" : undefined,
    searchContext,
  };
}

/** Create the conversation if needed, append the turn, and return the id. */
async function persistTurn(
  conversationId: string | null,
  userId: string,
  userText: string,
  result: Awaited<ReturnType<typeof runChat>>,
): Promise<string> {
  const id =
    conversationId ?? (await createConversation(userId, titleFromMessage(userText))).id;
  await appendTurn(id, {
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
  return id;
}

/**
 * POST /api/chat { messages, conversationId?, mode?, searchContext? } — runs a
 * chat turn (blocking) and saves it. Returns the full ChatResult + conversationId.
 */
router.post("/chat", async (req: Request, res: Response) => {
  const user = req.user!; // requireAuth guarantees req.user
  const history = parseHistory(req.body);
  if (!history || history.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const requestedId = (req.body as { conversationId?: unknown })?.conversationId;
  let conversationId: string | null =
    typeof requestedId === "string" && requestedId ? requestedId : null;
  if (conversationId && !(await userOwnsConversation(user.id, conversationId))) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  try {
    const userText = lastUserText(history);
    const userCtx = buildUserCtx(req.body, user, conversationId);
    const result = await runChat(history, userCtx);
    conversationId = await persistTurn(conversationId, user.id, userText, result);
    return res.json({ ...result, conversationId });
  } catch (err) {
    logger.error({ err }, "Chat agent failed");
    return res.status(500).json({ error: "Chat failed" });
  }
});

/**
 * POST /api/chat/stream — same contract as /chat, but streams the assistant's
 * text via Server-Sent Events as it's generated, then a final event with the
 * full ChatResult. Event payloads (one JSON object per `data:` line):
 *   { type: "delta",  text }                  — incremental assistant text
 *   { type: "result", ...ChatResult, conversationId } — the authoritative final turn
 *   { type: "error",  error }                 — failure after the stream opened
 * The client should render deltas live, then replace with `result.message`
 * (the authoritative final-turn text) and apply stage/payloads from `result`.
 */
router.post("/chat/stream", async (req: Request, res: Response) => {
  const user = req.user!;
  const history = parseHistory(req.body);
  if (!history || history.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const requestedId = (req.body as { conversationId?: unknown })?.conversationId;
  let conversationId: string | null =
    typeof requestedId === "string" && requestedId ? requestedId : null;
  if (conversationId && !(await userOwnsConversation(user.id, conversationId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // ask proxies not to buffer the stream
  res.flushHeaders?.();
  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const userText = lastUserText(history);
    const userCtx = buildUserCtx(req.body, user, conversationId);
    const result = await runChat(history, userCtx, (delta) => send({ type: "delta", text: delta }));
    conversationId = await persistTurn(conversationId, user.id, userText, result);
    send({ type: "result", ...result, conversationId });
    res.end();
  } catch (err) {
    logger.error({ err }, "Chat stream failed");
    send({ type: "error", error: "Chat failed" });
    res.end();
  }
});

export default router;

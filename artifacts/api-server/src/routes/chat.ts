import { Router, type IRouter, type Request, type Response } from "express";
import { runChat, type ChatTurn } from "../lib/chatAgent";
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

/** POST /api/chat { messages: [{role, content}] } — concierge agent turn. */
router.post("/chat", async (req: Request, res: Response) => {
  const history = parseHistory(req.body);
  if (!history || history.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const result = await runChat(history);
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Chat agent failed");
    return res.status(500).json({ error: "Chat failed" });
  }
});

export default router;

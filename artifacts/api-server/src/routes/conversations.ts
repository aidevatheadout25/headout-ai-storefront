import { Router, type IRouter, type Request, type Response } from "express";
import {
  getConversation,
  listConversations,
} from "../lib/conversations";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** GET /api/conversations — the signed-in user's saved chats, newest first. */
router.get("/conversations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Sign in to view your chats" });
  }
  try {
    const conversations = await listConversations(req.user.id);
    return res.json({ conversations });
  } catch (err) {
    logger.error({ err }, "Failed to list conversations");
    return res.status(500).json({ error: "Failed to list conversations" });
  }
});

/** GET /api/conversations/:id — one chat's full message history (owner only). */
router.get("/conversations/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Sign in to view your chats" });
  }
  try {
    const result = await getConversation(req.user.id, String(req.params.id));
    if (!result) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to get conversation");
    return res.status(500).json({ error: "Failed to get conversation" });
  }
});

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { getToolById, insertTool, listTools } from "../lib/catalogue";
import { inferToolFromUrl } from "../lib/inferTool";
import { logger } from "../lib/logger";
import { assertSafePublicUrl, UnsafeUrlError } from "../lib/urlGuard";

const router: IRouter = Router();

/** GET /api/tools?type=app — read-only browse of the catalogue. */
router.get("/tools", async (req: Request, res: Response) => {
  const typeParam = req.query.type;
  const type = typeof typeParam === "string" && typeParam ? typeParam : undefined;
  try {
    const tools = await listTools({ type });
    return res.json({ tools });
  } catch (err) {
    logger.error({ err }, "Failed to list tools");
    return res.status(500).json({ error: "Failed to list tools" });
  }
});

/** GET /api/tools/:id — single tool detail. */
router.get("/tools/:id", async (req: Request, res: Response) => {
  try {
    const tool = await getToolById(String(req.params.id));
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    return res.json({ tool });
  } catch (err) {
    logger.error({ err }, "Failed to get tool");
    return res.status(500).json({ error: "Failed to get tool" });
  }
});

/** POST /api/tools { url } — add a tool by URL; metadata inferred by the LLM. */
router.post("/tools", async (req: Request, res: Response) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    await assertSafePublicUrl(url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: "url is not a valid URL" });
  }

  try {
    const inferred = await inferToolFromUrl(url);
    const tool = await insertTool(inferred);
    return res.status(201).json({ tool });
  } catch (err) {
    logger.error({ err }, "Failed to add tool by URL");
    return res.status(500).json({ error: "Failed to add tool" });
  }
});

export default router;

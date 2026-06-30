import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";
import {
  claimTool,
  DuplicateToolError,
  findToolByUrl,
  getToolById,
  getToolRowById,
  hashManageToken,
  insertTool,
  listTools,
  updateTool,
} from "../lib/catalogue";
import { inferToolFromUrl } from "../lib/inferTool";
import { logger } from "../lib/logger";
import {
  assertSafePublicUrl,
  isSafeLinkScheme,
  UnsafeUrlError,
} from "../lib/urlGuard";
import { rateLimit } from "../middlewares/rateLimit";
import type { ToolRow } from "@workspace/db";

const router: IRouter = Router();

const TOOL_TYPES = [
  "app",
  "skill",
  "docs",
  "mcp",
  "plugin",
  "script",
  "slack-bot",
  "zep",
] as const;
const TEAMS = [
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
] as const;
const LIFECYCLE_STATUSES = [
  "planned",
  "beta",
  "live",
  "deprecated",
  "archived",
] as const;
const ACCESS_LEVELS = ["open", "request", "sensitive"] as const;

/** Read a string header, ignoring array/duplicate forms. */
function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/** True when the supplied manage key matches the tool's stored hash. */
function hasValidManageToken(row: ToolRow, token: string | undefined): boolean {
  if (!token || !row.manageTokenHash) return false;
  return safeEqual(hashManageToken(token), row.manageTokenHash);
}

/**
 * True when a valid admin key is supplied. The admin key is an optional shared
 * secret (`STOREFRONT_ADMIN_TOKEN`); when unset, the admin override is disabled
 * and only owners (with their manage key) can edit.
 */
function hasValidAdminToken(token: string | undefined): boolean {
  const expected = process.env.STOREFRONT_ADMIN_TOKEN;
  if (!expected || !token) return false;
  return safeEqual(token, expected);
}

/**
 * Abuse guard for the public add-by-URL endpoint: at most 10 submissions per
 * client every 10 minutes. Each submission triggers an outbound fetch + an LLM
 * call, so this also protects cost and the catalogue from a flood of entries.
 */
const addToolRateLimit = rateLimit({ limit: 10, windowMs: 10 * 60 * 1000 });

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
router.post(
  "/tools",
  addToolRateLimit,
  async (req: Request, res: Response) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) return res.status(400).json({ error: "url is required" });

    // Cheap scheme check up front — no network. Rejects javascript:/file:/etc.
    if (!isSafeLinkScheme(url)) {
      return res
        .status(400)
        .json({ error: "Only http and https URLs are allowed" });
    }

    try {
      // Dedup first — a pure string lookup, no network. If this URL (normalized)
      // is already catalogued, return the existing entry instead of creating a
      // duplicate, and skip the outbound fetch + LLM call entirely.
      const existing = await findToolByUrl(url);
      if (existing) {
        return res.status(200).json({ tool: existing, duplicate: true });
      }
    } catch (err) {
      logger.error({ err }, "Dedup lookup failed");
      return res.status(500).json({ error: "Failed to add tool" });
    }

    // Only genuinely new URLs reach the network: validate against SSRF before
    // fetching the page for the LLM.
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
      // A concurrent submission won the race and inserted this URL first.
      if (err instanceof DuplicateToolError) {
        return res.status(200).json({ tool: err.tool, duplicate: true });
      }
      logger.error({ err }, "Failed to add tool by URL");
      return res.status(500).json({ error: "Failed to add tool" });
    }
  },
);

const claimSchema = z.object({
  ownerName: z.string().trim().min(1),
  ownerSlackId: z.string().trim().min(1),
});

/**
 * POST /api/tools/:id/claim — claim ownership of an unclaimed tool, receiving a
 * one-time manage key. Re-claiming an already-claimed tool requires the admin
 * key (so an owner can be reassigned).
 */
router.post("/tools/:id/claim", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const row = await getToolRowById(id);
    if (!row) return res.status(404).json({ error: "Tool not found" });

    const parsed = claimSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Owner name and Slack handle are required" });
    }

    if (row.manageTokenHash) {
      // Already claimed — only an admin may reassign ownership.
      if (!hasValidAdminToken(headerValue(req, "x-admin-token"))) {
        return res.status(409).json({
          error:
            "This tool is already claimed. Ask the current owner or an admin to make changes.",
        });
      }
    }

    const result = await claimTool(id, parsed.data);
    if (!result) return res.status(404).json({ error: "Tool not found" });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to claim tool");
    return res.status(500).json({ error: "Failed to claim tool" });
  }
});

const patchSchema = z
  .object({
    type: z.enum(TOOL_TYPES),
    title: z.string().trim().min(1),
    oneLiner: z.string().trim(),
    description: z.string().trim(),
    tags: z.array(z.string().trim().min(1)),
    ownerName: z.string().trim().min(1),
    ownerSlackId: z.string().trim().min(1),
    team: z.enum(TEAMS),
    url: z.string().trim(),
    status: z.enum(LIFECYCLE_STATUSES),
    accessLevel: z.enum(ACCESS_LEVELS),
  })
  .partial()
  .strict();

/**
 * PATCH /api/tools/:id — owner/admin edit. Requires a valid manage key
 * (`x-manage-token`) for this tool, or the admin key (`x-admin-token`).
 * Re-embeds when search-relevant fields change.
 */
router.patch("/tools/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const row = await getToolRowById(id);
    if (!row) return res.status(404).json({ error: "Tool not found" });

    const authorized =
      hasValidManageToken(row, headerValue(req, "x-manage-token")) ||
      hasValidAdminToken(headerValue(req, "x-admin-token"));
    if (!authorized) {
      return res
        .status(403)
        .json({ error: "Not authorized to edit this tool" });
    }

    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid fields" });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (typeof patch.url === "string" && patch.url !== "") {
      try {
        await assertSafePublicUrl(patch.url);
      } catch (err) {
        return res.status(400).json({
          error:
            err instanceof UnsafeUrlError ? err.message : "url is not valid",
        });
      }
    }

    const updated = await updateTool(id, patch);
    if (!updated) return res.status(404).json({ error: "Tool not found" });
    return res.json({ tool: updated });
  } catch (err) {
    logger.error({ err }, "Failed to update tool");
    return res.status(500).json({ error: "Failed to update tool" });
  }
});

export default router;

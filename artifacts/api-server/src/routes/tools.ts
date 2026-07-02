import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import {
  claimTool,
  DuplicateToolError,
  fetchTagVocabulary,
  findToolByUrl,
  getToolById,
  getToolRowById,
  hashManageToken,
  insertTool,
  insertAccessRequest,
  insertToolFlag,
  listTools,
  updateTool,
} from "../lib/catalogue";
import {
  hasTooFewTags,
  MAX_TAGS,
  MIN_TAGS,
  normalizeTags,
  renderTagVocabulary,
  TAG_POLICY_PROMPT,
} from "../lib/tagPolicy";
import { inferToolFromUrl, isZepsUrl, type InferredTool } from "../lib/inferTool";
import { logger } from "../lib/logger";
import { anthropic, CLAUDE_MODEL } from "../lib/anthropicClient";
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

/**
 * POST /api/tools/inspect { url } — infer catalogue metadata for a pasted URL
 * and return it as a *preview* WITHOUT saving. The expensive outbound fetch +
 * LLM call live here, so this is the rate-limited step. The client reviews and
 * (optionally) edits the preview, then confirms via POST /api/tools.
 *
 * If the URL is already catalogued, returns `{ duplicate: true, tool }` so the
 * UI can short-circuit to the existing entry.
 */
router.post(
  "/tools/inspect",
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
      // is already catalogued, return the existing entry and skip the fetch+LLM.
      const existing = await findToolByUrl(url);
      if (existing) {
        return res.status(200).json({ duplicate: true, tool: existing });
      }
    } catch (err) {
      logger.error({ err }, "Dedup lookup failed");
      return res.status(500).json({ error: "Failed to inspect tool" });
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
      const { preview, lowConfidence } = await inferToolFromUrl(url);
      return res.status(200).json({
        duplicate: false,
        lowConfidence,
        preview: {
          type: preview.type,
          title: preview.title,
          oneLiner: preview.oneLiner,
          description: preview.description,
          tags: preview.tags ?? [],
          team: preview.team,
          url: preview.url,
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to inspect tool by URL");
      return res.status(500).json({ error: "Failed to inspect tool" });
    }
  },
);

// ── Add-tool chat helpers ─────────────────────────────────────────────────────

const TOOL_TYPES_LIST = TOOL_TYPES.join(", ");
const TEAMS_LIST = TEAMS.join(", ");

/** Compose the first assistant message summarising what was inferred. */
function buildOpeningMessage(preview: InferredTool, lowConfidence: boolean): string {
  if (lowConfidence) {
    return `I couldn't get much from that page. What does this tool do, and which team owns it?`;
  }
  if (hasTooFewTags(preview.tags ?? [])) {
    return `I found **${preview.title}** — looks like a ${preview.type} from the ${preview.team} team. I couldn't pin down enough specific tags, though — what systems, data, or function does it cover?`;
  }
  return `I found **${preview.title}** — looks like a ${preview.type} from the ${preview.team} team. Does that sound right, or anything to correct?`;
}

const FINALIZE_TOOL: Anthropic.Tool = {
  name: "finalize_tool",
  description:
    "Call this when all required fields are confirmed and the user has approved the details. Supply the complete, final tool draft.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: TOOL_TYPES as unknown as string[] },
      title: { type: "string" },
      oneLiner: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      team: { type: "string", enum: TEAMS as unknown as string[] },
    },
    required: ["type", "title", "oneLiner", "description", "tags", "team"],
  },
};

type ToolDraftPayload = {
  type: string;
  title: string;
  oneLiner: string;
  description: string;
  tags: string[];
  team: string;
  url: string;
};

const addChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const addChatSchema = z.object({
  url: z.string().trim().min(1),
  messages: z.array(addChatMessageSchema).optional().default([]),
  preview: z
    .object({
      type: z.string(),
      title: z.string(),
      oneLiner: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      team: z.string(),
      url: z.string(),
    })
    .optional(),
});

/**
 * POST /api/tools/add-chat — stateless conversational add-tool flow.
 *
 * First turn  ({ url, messages: [] }): infers metadata from the URL and returns
 * an opening assistant message + the draft preview. No save happens here.
 *
 * Subsequent turns ({ url, messages, preview }): continues the conversation via
 * the LLM. When all fields are confirmed the LLM calls `finalize_tool` and the
 * response carries { ready: true, preview }.
 *
 * If the URL is already in the catalogue, returns { duplicate: true, tool }.
 */
router.post(
  "/tools/add-chat",
  addToolRateLimit,
  async (req: Request, res: Response) => {
    const parsed = addChatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "url is required" });
    }
    const { url, messages, preview: clientPreview } = parsed.data;

    if (!isSafeLinkScheme(url)) {
      return res
        .status(400)
        .json({ error: "Only http and https URLs are allowed" });
    }

    // Dedup check (pure DB, no network).
    try {
      const existing = await findToolByUrl(url);
      if (existing) {
        return res.status(200).json({ duplicate: true, tool: existing });
      }
    } catch (err) {
      logger.error({ err }, "Dedup lookup failed in add-chat");
      return res.status(500).json({ error: "Failed to check tool" });
    }

    // ── First turn: infer metadata and compose opening message ────────────────
    if (messages.length === 0) {
      try {
        await assertSafePublicUrl(url);
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: "url is not a valid URL" });
      }

      try {
        const { preview, lowConfidence } = await inferToolFromUrl(url);
        const message = buildOpeningMessage(preview, lowConfidence);
        const draftPreview: ToolDraftPayload = {
          type: preview.type ?? "app",
          title: preview.title ?? "",
          oneLiner: preview.oneLiner ?? "",
          description: preview.description ?? "",
          tags: preview.tags ?? [],
          team: preview.team ?? "Platform",
          url: preview.url ?? url,
        };
        return res.status(200).json({
          ready: false,
          message,
          preview: draftPreview,
          lowConfidence,
        });
      } catch (err) {
        logger.error({ err }, "Failed to infer tool in add-chat");
        return res
          .status(500)
          .json({ error: "Couldn't read that link — check the URL and try again." });
      }
    }

    // ── Subsequent turns: continue the conversation via LLM ──────────────────
    if (!clientPreview) {
      return res
        .status(400)
        .json({ error: "preview is required for subsequent turns" });
    }

    const vocabulary = await fetchTagVocabulary();

    const systemPrompt = `You are helping a Headout teammate add an internal tool to the AI catalogue. You have inferred some metadata from the URL and need to confirm or fill in any gaps.

Current draft:
- Title: ${clientPreview.title}
- Type: ${clientPreview.type}
- Team: ${clientPreview.team}
- One-liner: ${clientPreview.oneLiner}
- Tags: ${clientPreview.tags.join(", ")}
- Description: ${clientPreview.description || "(none yet)"}

Valid types: ${TOOL_TYPES_LIST}
Valid teams: ${TEAMS_LIST}

${TAG_POLICY_PROMPT}
Existing catalogue tags (reuse these before inventing new ones): ${renderTagVocabulary(vocabulary)}

Rules:
- Be direct and brief. One sentence, one question per reply. No bullet points. No markdown headers.
- Apply any corrections immediately to the draft before finalising. When the user edits tags, keep them compliant with the tagging policy above (never accept a banned generic tag or a non-kebab-case tag verbatim).
- When the user confirms (e.g. "yes", "looks good", or supplies the last missing detail), call finalize_tool right away. Do not ask again after they've said yes.`;

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        tools: [FINALIZE_TOOL],
        tool_choice: { type: "auto" },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const toolBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === "tool_use" && b.name === "finalize_tool",
      );

      if (!textBlock && !toolBlock) {
        return res.status(500).json({ error: "No response from AI" });
      }

      if (toolBlock) {
        const finalArgs = (toolBlock.input ?? {}) as Partial<ToolDraftPayload>;
        const finalTags = normalizeTags(finalArgs.tags ?? clientPreview.tags);
        // Don't finalise below the policy minimum — keep the conversation open
        // and ask for more specific facets instead of saving a weak entry.
        if (hasTooFewTags(finalTags)) {
          return res.status(200).json({
            ready: false,
            message: `Before I add this I need at least ${MIN_TAGS} specific tags (the systems, data, or function it covers) — what does this tool work with?`,
            preview: { ...clientPreview, tags: finalTags },
          });
        }
        const finalPreview: ToolDraftPayload = {
          type: finalArgs.type ?? clientPreview.type,
          title: finalArgs.title ?? clientPreview.title,
          oneLiner: finalArgs.oneLiner ?? clientPreview.oneLiner,
          description: finalArgs.description ?? clientPreview.description,
          tags: finalTags,
          team: finalArgs.team ?? clientPreview.team,
          url,
        };
        const confirmText =
          `Ready to add **${finalPreview.title}** (${finalPreview.type} · ${finalPreview.team}) to the catalogue. Tap the button below to confirm.`;
        return res.status(200).json({
          ready: true,
          message: confirmText,
          preview: finalPreview,
        });
      }

      // LLM replied with a text question.
      return res.status(200).json({
        ready: false,
        message: textBlock?.type === "text" ? textBlock.text : "",
        preview: clientPreview,
      });
    } catch (err) {
      logger.error({ err }, "LLM error in add-chat");
      return res.status(500).json({ error: "The AI assistant is unavailable — try again." });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  url: z.string().trim().min(1),
  type: z.enum(TOOL_TYPES),
  title: z.string().trim().min(1),
  oneLiner: z.string().trim(),
  description: z.string().trim(),
  tags: z.array(z.string().trim().min(1)),
  team: z.enum(TEAMS),
});

/**
 * POST /api/tools — persist a reviewed tool. The metadata here is the
 * (possibly edited) values the user confirmed from the inspect preview, so we
 * save exactly what they reviewed rather than re-inferring. Still dedups and
 * SSRF-validates the URL. Zeps URLs are pinned to the `zep` type.
 */
router.post("/tools", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Title, type, team and a valid URL are required" });
  }
  const data = parsed.data;

  if (!isSafeLinkScheme(data.url)) {
    return res
      .status(400)
      .json({ error: "Only http and https URLs are allowed" });
  }

  // Final policy backstop: stored tags must satisfy the 3–6 specific-facet rule.
  const normalizedTags = normalizeTags(data.tags);
  if (hasTooFewTags(normalizedTags)) {
    return res.status(400).json({
      error: `Tags must be ${MIN_TAGS}–${MAX_TAGS} specific facets (e.g. the systems, team, or function it covers).`,
    });
  }

  try {
    const existing = await findToolByUrl(data.url);
    if (existing) {
      return res.status(200).json({ tool: existing, duplicate: true });
    }
  } catch (err) {
    logger.error({ err }, "Dedup lookup failed");
    return res.status(500).json({ error: "Failed to add tool" });
  }

  try {
    await assertSafePublicUrl(data.url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: "url is not a valid URL" });
  }

  try {
    const tool = await insertTool({
      type: isZepsUrl(data.url) ? "zep" : data.type,
      title: data.title,
      oneLiner: data.oneLiner,
      description: data.description,
      tags: normalizedTags,
      team: data.team,
      url: data.url,
      ownerName: "",
      ownerSlackId: "",
      verified: false,
      source: "manual",
      visibility: "org",
      status: "live",
      accessLevel: "open",
    });
    return res.status(201).json({ tool });
  } catch (err) {
    // A concurrent submission won the race and inserted this URL first.
    if (err instanceof DuplicateToolError) {
      return res.status(200).json({ tool: err.tool, duplicate: true });
    }
    logger.error({ err }, "Failed to add tool");
    return res.status(500).json({ error: "Failed to add tool" });
  }
});

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

/** POST /api/tools/:id/flag — report a tool as broken, outdated, or incorrect. */
router.post("/tools/:id/flag", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const tool = await getToolById(id);
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "other";
    const details =
      typeof req.body?.details === "string" ? req.body.details.trim() : "";
    const reporterEmail = req.isAuthenticated()
      ? ((req.user as { email?: string })?.email ?? "")
      : "";

    await insertToolFlag({ toolId: id, reason, details, reporterEmail });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to flag tool");
    return res.status(500).json({ error: "Failed to flag tool" });
  }
});

/** POST /api/tools/:id/access-request — request access to a restricted tool. */
router.post("/tools/:id/access-request", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const tool = await getToolById(id);
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const requesterEmail = req.isAuthenticated()
      ? ((req.user as { email?: string })?.email ?? "")
      : "";

    await insertAccessRequest({ toolId: id, reason, requesterEmail });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to submit access request");
    return res.status(500).json({ error: "Failed to submit access request" });
  }
});

export default router;

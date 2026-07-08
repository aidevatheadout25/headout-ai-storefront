import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, briefsTable, buildsTable, toolsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { insertTool } from "../lib/catalogue";
import { slugify } from "../lib/slugify";

const router: IRouter = Router();

const briefSchema = z.object({
  conversationId: z.string().optional(),
  searchContext: z.object({
    query: z.string().default(""),
    nearMisses: z.array(z.any()).default([]),
  }).default({ query: "", nearMisses: [] }),
  problem: z.string().default(""),
  users: z.string().default(""),
  frequency: z.string().default(""),
  mustDo: z.array(z.string()).default([]),
  wontDo: z.array(z.string()).default([]),
  appClass: z.enum(["micro", "full"]).default("micro"),
  risk: z.enum(["low", "high"]).default("low"),
  state: z.enum(["draft", "confirmed", "built", "live"]).default("draft"),
});

const patchBriefSchema = briefSchema.partial();

/** POST /api/briefs — persist a draft_brief payload from the critique agent. */
router.post("/briefs", async (req: Request, res: Response) => {
  const parsed = briefSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid brief payload" });
  }
  const data = parsed.data;
  try {
    const [row] = await db
      .insert(briefsTable)
      .values({
        conversationId: data.conversationId ?? null,
        searchContext: data.searchContext as Record<string, unknown>,
        problem: data.problem,
        users: data.users,
        frequency: data.frequency,
        mustDo: data.mustDo,
        wontDo: data.wontDo,
        appClass: data.appClass,
        risk: data.risk,
        state: data.state,
      })
      .returning();
    return res.status(201).json({ brief: row });
  } catch (err) {
    logger.error({ err }, "Failed to create brief");
    return res.status(500).json({ error: "Failed to create brief" });
  }
});

/** PATCH /api/briefs/:id — partial update from the brief editor card. */
router.patch("/briefs/:id", async (req: Request, res: Response) => {
  const parsed = patchBriefSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid brief fields" });
  }
  const data = parsed.data;
  try {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (data.problem !== undefined) values.problem = data.problem;
    if (data.users !== undefined) values.users = data.users;
    if (data.frequency !== undefined) values.frequency = data.frequency;
    if (data.mustDo !== undefined) values.mustDo = data.mustDo;
    if (data.wontDo !== undefined) values.wontDo = data.wontDo;
    if (data.appClass !== undefined) values.appClass = data.appClass;
    if (data.risk !== undefined) values.risk = data.risk;
    if (data.state !== undefined) values.state = data.state;
    if (data.searchContext !== undefined) values.searchContext = data.searchContext as Record<string, unknown>;

    const [row] = await db
      .update(briefsTable)
      .set(values)
      .where(sql`${briefsTable.id} = ${req.params.id}`)
      .returning();
    if (!row) return res.status(404).json({ error: "Brief not found" });
    return res.json({ brief: row });
  } catch (err) {
    logger.error({ err }, "Failed to update brief");
    return res.status(500).json({ error: "Failed to update brief" });
  }
});

/** POST /api/scaffold — simulate repo creation from a confirmed brief. */
router.post("/scaffold", async (req: Request, res: Response) => {
  const briefId = typeof req.body?.briefId === "string" ? req.body.briefId : null;
  if (!briefId) return res.status(400).json({ error: "briefId is required" });

  const briefs = await db
    .select()
    .from(briefsTable)
    .where(sql`${briefsTable.id} = ${briefId}`)
    .limit(1);
  const brief = briefs[0];
  if (!brief) return res.status(404).json({ error: "Brief not found" });

  const slug = slugify(brief.problem || "new-tool");
  const repoUrl = `https://github.com/headout-internal/${slug}`;

  const contents = [
    "README.md — overview, setup, and usage",
    "src/index.ts — entry point wired to Headout MCP",
    "src/handler.ts — core logic from the brief",
    ".github/workflows/ci.yml — lint + test + deploy pipeline",
    "tests/handler.test.ts — unit tests for main handler",
  ];

  await new Promise((r) => setTimeout(r, 1500));

  const [build] = await db
    .insert(buildsTable)
    .values({
      briefId,
      repoUrl,
      checklistState: {} as Record<string, unknown>,
      reviewState: {} as Record<string, unknown>,
    })
    .returning();

  await db
    .update(briefsTable)
    .set({ state: "confirmed", updatedAt: new Date() })
    .where(sql`${briefsTable.id} = ${briefId}`);

  return res.json({ repoUrl, contents, briefId, buildId: build.id });
});

/** POST /api/builds/:buildId/verify-step — simulate checklist step verification. */
router.post(
  "/builds/:buildId/verify-step",
  async (req: Request, res: Response) => {
    const step = typeof req.body?.step === "number" ? req.body.step : -1;
    if (step < 0 || step > 3) {
      return res.status(400).json({ error: "step must be 0–3" });
    }

    const builds = await db
      .select()
      .from(buildsTable)
      .where(sql`${buildsTable.id} = ${req.params.buildId}`)
      .limit(1);
    const build = builds[0];
    if (!build) return res.status(404).json({ error: "Build not found" });

    await new Promise((r) => setTimeout(r, 1000));

    const existing = (build.checklistState ?? {}) as Record<string, unknown>;
    const updated = { ...existing, [`step${step}`]: true };
    await db
      .update(buildsTable)
      .set({ checklistState: updated as Record<string, unknown>, updatedAt: new Date() })
      .where(sql`${buildsTable.id} = ${req.params.buildId}`);

    return res.json({ ok: true });
  },
);

const REVIEW_STAGES = [
  { stage: "ci", label: "Running CI checks" },
  { stage: "secrets", label: "Scanning for secrets" },
  { stage: "auth", label: "Verifying auth rules" },
  { stage: "security", label: "Security policy check" },
  { stage: "human", label: "Human sign-off" },
  { stage: "deploy", label: "Deploy + smoke test" },
];

/**
 * POST /api/builds/:buildId/submit-review — run the simulated review sequence
 * then really insert the finished tool into the catalogue with an embedding.
 */
router.post(
  "/builds/:buildId/submit-review",
  async (req: Request, res: Response) => {
    const builds = await db
      .select()
      .from(buildsTable)
      .where(sql`${buildsTable.id} = ${req.params.buildId}`)
      .limit(1);
    const build = builds[0];
    if (!build) return res.status(404).json({ error: "Build not found" });

    const briefs = await db
      .select()
      .from(briefsTable)
      .where(sql`${briefsTable.id} = ${build.briefId}`)
      .limit(1);
    const brief = briefs[0];
    if (!brief) return res.status(404).json({ error: "Brief not found" });

    const events: { stage: string; label: string; ok: boolean }[] = [];
    for (const s of REVIEW_STAGES) {
      await new Promise((r) => setTimeout(r, 400));
      events.push({ ...s, ok: true });
    }

    const reviewState = Object.fromEntries(
      events.map((e) => [e.stage, { ok: e.stage }]),
    );
    await db
      .update(buildsTable)
      .set({ reviewState: reviewState as Record<string, unknown>, updatedAt: new Date() })
      .where(sql`${buildsTable.id} = ${build.id}`);

    const title = brief.problem
      ? brief.problem.slice(0, 60).replace(/\.$/, "")
      : "Builder Tool";
    const slug = slugify(title);

    const mustDo = (brief.mustDo ?? []) as string[];
    const description =
      brief.problem ||
      `Built via the Builder journey. Users: ${brief.users}. Frequency: ${brief.frequency}.`;

    let tool;
    try {
      tool = await insertTool({
        type: "app",
        title,
        oneLiner: mustDo[0] || description.slice(0, 80),
        description,
        tags: ["builder", slug, brief.appClass ?? "micro"],
        team: "Platform",
        url: build.repoUrl,
        ownerName: "",
        ownerSlackId: "",
        source: "built",
        visibility: "org",
        status: "beta",
        accessLevel: "open",
      });
    } catch (err) {
      logger.error({ err }, "Failed to insert built tool");
      return res.status(500).json({ error: "Failed to register tool" });
    }

    await db
      .update(buildsTable)
      .set({ toolId: tool.id, updatedAt: new Date() })
      .where(sql`${buildsTable.id} = ${build.id}`);

    await db
      .update(briefsTable)
      .set({ state: "live", updatedAt: new Date() })
      .where(sql`${briefsTable.id} = ${brief.id}`);

    return res.json({
      events,
      toolId: tool.id,
      toolName: tool.name,
      toolSlug: slug,
    });
  },
);

export default router;

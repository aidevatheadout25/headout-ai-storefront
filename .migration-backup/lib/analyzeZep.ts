import { generateText, Output } from "ai";
import { z } from "zod";
import { TEAMS, type Team, type ToolFormData } from "@/lib/types";
import type { ZepManifest } from "@/lib/zeps";

export type ZepAnalysisDraft = Partial<
  Pick<
    ToolFormData,
    "name" | "oneLiner" | "description" | "types" | "tags" | "team" | "link"
  >
>;

const teamSchema = z.enum([
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
]);

const zepDraftSchema = z.object({
  name: z.string().optional(),
  oneLiner: z.string().optional(),
  description: z.string().optional(),
  types: z.array(z.literal("zep")).optional(),
  tags: z.string().optional(),
  team: teamSchema.optional(),
  link: z.string().optional(),
});

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? text).trim();
}

function sanitizeDraft(raw: z.infer<typeof zepDraftSchema>): ZepAnalysisDraft {
  const draft: ZepAnalysisDraft = { types: ["zep"] };

  if (raw.name?.trim()) draft.name = raw.name.trim();
  if (raw.oneLiner?.trim()) draft.oneLiner = raw.oneLiner.trim();
  if (raw.description?.trim()) draft.description = raw.description.trim();
  if (raw.tags?.trim()) draft.tags = raw.tags.trim();
  if (raw.link?.trim()) draft.link = raw.link.trim();
  if (raw.team && TEAMS.includes(raw.team as Team)) {
    draft.team = raw.team as Team;
  }

  return draft;
}

export function mapManifestDeterministic(manifest: ZepManifest): ZepAnalysisDraft {
  const description = manifest.description?.trim() ?? "";
  const tags = manifest.requiredConnectors?.filter(Boolean).join(",") ?? "";

  return {
    name: manifest.name?.trim() || undefined,
    oneLiner: description ? firstSentence(description) : undefined,
    description: description || undefined,
    types: ["zep"],
    tags: tags || undefined,
    link: manifest.runtimeUrl?.trim() || undefined,
  };
}

function hasAiConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.OPENAI_API_KEY,
  );
}

async function analyzeManifestWithAi(
  manifest: ZepManifest,
): Promise<ZepAnalysisDraft | null> {
  const { output } = await generateText({
    model: "openai/gpt-4o-mini",
    temperature: 0,
    output: Output.object({ schema: zepDraftSchema }),
    prompt: `You map a Zeps agent manifest to a tool catalogue listing.

Return STRICT JSON matching the schema. Rules:
- types must be ["zep"] when set
- oneLiner: one sentence summary for search cards
- description: fuller listing copy
- tags: comma-separated search tags (from requiredConnectors, skills, triggers if useful)
- team: only if clearly inferable; otherwise omit
- link: runtimeUrl when present
- Do NOT include accessLevel, sensitive, or status

Manifest:
${JSON.stringify(manifest, null, 2)}`,
  });

  if (!output) return null;
  return sanitizeDraft(output);
}

export async function analyzeZepManifest(
  manifest: ZepManifest,
): Promise<ZepAnalysisDraft> {
  if (hasAiConfigured()) {
    try {
      const aiDraft = await analyzeManifestWithAi(manifest);
      if (aiDraft) return aiDraft;
    } catch {
      // Fall back to deterministic mapping when AI is unavailable.
    }
  }

  return mapManifestDeterministic(manifest);
}

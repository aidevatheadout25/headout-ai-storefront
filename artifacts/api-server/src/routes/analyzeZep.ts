import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

type ZepManifest = {
  name?: string;
  description?: string;
  requiredConnectors?: string[];
  skills?: string[];
  triggers?: string[];
  runtimeUrl?: string;
  id?: string;
};

type ZepAnalysisDraft = {
  name?: string;
  oneLiner?: string;
  description?: string;
  types?: ["zep"];
  tags?: string;
  team?: string;
  link?: string;
};

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? text).trim();
}

function mapManifestDeterministic(manifest: ZepManifest): ZepAnalysisDraft {
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

router.post("/analyze-zep", (req: Request, res: Response) => {
  const manifest = (req.body?.manifest ?? null) as ZepManifest | null;

  if (!manifest || typeof manifest !== "object") {
    return res.status(400).json({ error: "manifest is required" });
  }

  return res.json(mapManifestDeterministic(manifest));
});

export default router;

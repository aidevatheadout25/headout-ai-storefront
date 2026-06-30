import { type ToolFormData } from "@/lib/types";
import type { ZepManifest } from "@/lib/zeps";

export type ZepAnalysisDraft = Partial<
  Pick<
    ToolFormData,
    "name" | "oneLiner" | "description" | "types" | "tags" | "team" | "link"
  >
>;

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? text).trim();
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

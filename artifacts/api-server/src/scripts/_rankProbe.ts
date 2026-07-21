/* TEMP probe 2 */
import { embed, embedMany } from "../lib/embeddings";
import { ALL_REAL_SEED_TOOLS } from "../lib/realSeedData";

function toolEmbeddingText(input: {
  title: string;
  oneLiner?: string | null;
  description?: string | null;
  tags?: string[] | null;
  type?: string;
}): string {
  return [input.title, input.oneLiner, input.description, (input.tags ?? []).join(", "), input.type]
    .filter((p) => p && p.trim().length > 0)
    .join(". ");
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const POS = [
  "clean up noisy log lines that are costing too much",
  "run my local service against a kubernetes test environment",
  "one command to connect the VPN and switch kubernetes context",
  "answer product questions about flows, specs and components from an agent",
  "track my team's Claude Code usage, streaks and activity",
  "content RAG system for tour and experience descriptions",
  "get a weekly digest of open pull requests for my pod",
  "generate an AGENTS.md or CLAUDE.md file for a repo",
];

async function main() {
  const texts = ALL_REAL_SEED_TOOLS.map((t) => toolEmbeddingText(t as never));
  const toolEmb = await embedMany(texts);
  const names = ALL_REAL_SEED_TOOLS.map((t) => t.title);
  for (const q of POS) {
    const qe = await embed(q);
    const top = names
      .map((n, i) => ({ n, s: dot(qe, toolEmb[i]) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);
    console.log(`\nQ: ${q}\n  ` + top.map((r, i) => `${i + 1}. ${r.n} (${r.s.toFixed(3)})`).join("\n  "));
  }
}
main().then(() => process.exit(0));

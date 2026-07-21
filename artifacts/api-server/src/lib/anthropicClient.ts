export { anthropic } from "@workspace/integrations-anthropic-ai";
// The model is pinned via the CLAUDE_MODEL env var — set it explicitly per
// deploy (on Railway, in the service variables) rather than relying on this
// default. The fallback below is what the checked-in eval baseline
// (e2e-report.md, 9/12) was measured against; changing the model is a
// deliberate decision that must be followed by re-running
// `tsx src/eval/e2eConversations.ts` to confirm behaviour parity, not a silent
// default bump.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

export { anthropic } from "@workspace/integrations-anthropic-ai";
// Overridable via env so the deploy target can pin a model the host's Anthropic
// endpoint actually serves (the Replit proxy alias differs from the public API).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

import Anthropic from "@anthropic-ai/sdk";

// Prefer the legacy Replit AI-integration vars when present (backwards
// compatible), otherwise fall back to the standard Anthropic env vars so the
// app runs on any host (Railway, local, etc.). The base URL is optional — the
// SDK defaults to the public Anthropic API (https://api.anthropic.com) when it
// is not set, which is what we want off Replit. Set ANTHROPIC_BASE_URL only to
// route through an LLM gateway.
const apiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY;

const baseURL =
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ??
  process.env.ANTHROPIC_BASE_URL;

if (!apiKey) {
  throw new Error(
    "Anthropic API key missing. Set ANTHROPIC_API_KEY (or the legacy AI_INTEGRATIONS_ANTHROPIC_API_KEY).",
  );
}

export const anthropic = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

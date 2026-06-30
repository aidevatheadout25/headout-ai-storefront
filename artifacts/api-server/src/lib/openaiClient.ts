import OpenAI from "openai";

/**
 * Direct OpenAI client using the user's own API key (`OPENAI_API_KEY`),
 * talking to api.openai.com — NOT the Replit AI integration proxy.
 *
 * The model defaults to a broadly-available chat model that supports both
 * function calling (chat agent) and JSON-schema structured outputs (URL
 * inference); override it with `OPENAI_MODEL` if your key has access to another.
 */
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY must be set. Add your OpenAI API key in the Secrets tab.",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

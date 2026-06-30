import { openai } from "@workspace/integrations-openai-ai-server";
import type OpenAI from "openai";
import { searchCatalogue, type ApiTool } from "./catalogue";

const MODEL = "gpt-5.4";
const MAX_TURNS = 4;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  message: string;
  tools: ApiTool[];
  noMatch: boolean;
};

const SYSTEM_PROMPT = `You are the concierge for the Headout AI Storefront — an internal meta-catalogue of the AI tools, apps, skills, docs, plugins, MCPs and Zeps that Headout teams have built.

Your one job is to help a teammate FIND an existing internal tool for what they are trying to do. You are a router, not a runner: you never execute, operate, or pretend to operate any tool — you only point people to the right one.

Rules:
- Use the search_catalogue tool to look up tools for the user's need. Rewrite vague asks into a concise capability description before searching. You may search more than once with different phrasings if the first results are weak.
- If the request is genuinely ambiguous, ask EXACTLY ONE short clarifying question instead of searching. Never ask more than one.
- When you recommend tools, mention each one by its EXACT name from the search results, and give a one-line reason it fits. Recommend at most 3, only ones that truly match. The UI shows a card for every tool you name, so do not name tools you are not recommending.
- If nothing in the catalogue fits, say so plainly and do NOT name or invent any tool. Then offer the two next steps: building it (e.g. with Zeps) or requesting it from the platform team. Keep this to 1-2 sentences.
- Be concise and warm. No preamble, no markdown headers. Never claim to run a tool or perform its task yourself.`;

const SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_catalogue",
    description:
      "Search the internal Headout catalogue for tools matching a capability or problem. Returns the most relevant tools with id, name, type, one-liner and tags.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A concise natural-language description of the capability or problem the user wants a tool for.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

function pickRecommended(found: Map<string, ApiTool>, message: string): ApiTool[] {
  const lower = message.toLowerCase();
  const named = [...found.values()].filter((t) =>
    lower.includes(t.name.toLowerCase()),
  );
  return named;
}

export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  const found = new Map<string, ApiTool>();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [SEARCH_TOOL],
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;
    messages.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const message = choice.content ?? "";
      const recommended = pickRecommended(found, message);
      return { message, tools: recommended, noMatch: recommended.length === 0 };
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let query = "";
      try {
        query = String(JSON.parse(call.function.arguments || "{}").query ?? "");
      } catch {
        query = "";
      }
      const results = await searchCatalogue(query, 6);
      for (const tool of results) found.set(tool.id, tool);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(
          results.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.types[0],
            oneLiner: t.oneLiner,
            tags: t.tags,
            similarity: Number((t.similarity ?? 0).toFixed(3)),
          })),
        ),
      });
    }
  }

  // Exhausted turns without a clean final answer — surface what we found.
  const fallback = [...found.values()].slice(0, 3);
  return {
    message:
      fallback.length > 0
        ? "Here are the closest matches I found."
        : "I couldn't find a tool for that in the catalogue. You could build it (e.g. with Zeps) or request it from the platform team.",
    tools: fallback,
    noMatch: fallback.length === 0,
  };
}

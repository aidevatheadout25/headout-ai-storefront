import type OpenAI from "openai";
import { openai, OPENAI_MODEL } from "./openaiClient";
import { searchCatalogue, MIN_MATCH_SIMILARITY, type ApiTool } from "./catalogue";

const MODEL = OPENAI_MODEL;
const MAX_TURNS = 5;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** The single best-fit builder the concierge can hand a scoped need off to. */
export type BuilderId = "replit" | "claude-code" | "claude-skill" | "zeps";

const BUILDER_IDS: BuilderId[] = [
  "replit",
  "claude-code",
  "claude-skill",
  "zeps",
];

const BUILDER_LABELS: Record<BuilderId, string> = {
  replit: "Replit",
  "claude-code": "Claude Code",
  "claude-skill": "a Claude skill",
  zeps: "Zeps",
};

/**
 * Where the build-gate funnel has landed for this reply:
 * - `chat`: a normal answer, clarifying question, match presentation, or one of
 *   the scoping questions — the build/Slack hand-off UI must NOT render.
 * - `handoff`: the funnel has cleared search + confirmation + scoping, so the
 *   hand-off UI may render with `recommendedBuilder` as the primary action.
 */
export type FunnelStage = "chat" | "handoff";

export type ChatResult = {
  message: string;
  tools: ApiTool[];
  /** True when no catalogue tool was recommended this turn. Drives nothing in
   *  the UI on its own anymore — the hand-off UI is gated on `stage`. */
  noMatch: boolean;
  stage: FunnelStage;
  /** Set only at the hand-off stage: the single best-fit builder, chosen by fit. */
  recommendedBuilder: BuilderId | null;
  /** A concise build brief synthesised from the scoping answers, for pre-fill. */
  buildPrompt: string | null;
};

const SYSTEM_PROMPT = `You are the concierge for the Headout AI Storefront — an internal meta-catalogue of the AI tools, apps, skills, docs, plugins, MCPs and Zeps that Headout teams have built.

Your job is to help a teammate FIND an existing internal tool before anyone builds anything new. You are a router, not a runner: never execute, operate, or pretend to operate any tool — only point people to the right one. Building is the END of a funnel, never a first move.

Follow this funnel STRICTLY, in order. Never skip a step.

1) ALWAYS SEARCH FIRST. For EVERY request — including an explicit "build me X" or "I want to make Y" — call search_catalogue before anything else. Rewrite vague asks into a concise capability description first. You may search again with different phrasing if results are weak. NEVER suggest or offer to build before you have searched.

2) IF MATCHES COME BACK, present them and ask whether one fits. Name each tool by its EXACT name from the results with a one-line reason it fits (at most 3, only genuine matches; the UI renders a card for every tool you name, so never name a tool you are not recommending). Then ask plainly: does one of these cover your need, or is what you want meaningfully different? Do NOT move toward building while a plausible match is unconfirmed.

3) ONLY WHEN NOTHING RELEVANT EXISTS, or the user says the matches don't fit, gather scope. Ask up to THREE short questions, ONE AT A TIME — wait for each answer before asking the next:
   a) one concrete scenario it must handle,
   b) what data / systems / tools it needs to touch,
   c) who will use it and how often.
   Do not bundle them into one message, and do not hand off before you have the answers.

4) ONLY AFTER you have the scoping answers, call hand_off_to_builder EXACTLY ONCE with the single best-fit builder and a one-line reason. Choose by fit — do NOT default to Zeps:
   - replit: full apps, UIs, backends, databases, anything hosted.
   - claude-code: code-heavy automation inside an existing repo / developer workflow.
   - claude-skill: a reusable Claude skill/instruction packaged for teammates.
   - zeps: a no-code conversational agent or workflow built and run in Zeps.
   After the call, write ONE warm closing sentence naming the recommended builder and why, and note they can also request it from the platform team on Slack.

Hard rules: never recommend building before searching; never call hand_off_to_builder before the scoping answers are in; never name or invent a tool that was not in the search results. If a request is genuinely ambiguous BEFORE you can even search, ask exactly one short clarifying question. Be concise and warm — no preamble, no markdown headers, and never claim to run a tool yourself.`;

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

const HANDOFF_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "hand_off_to_builder",
    description:
      "Call this ONLY after you have (1) searched the catalogue, (2) confirmed nothing existing fits, and (3) collected the three scoping answers. It signals that the funnel has reached the build hand-off stage and records the single best-fit builder. Never call it before scoping is complete.",
    parameters: {
      type: "object",
      properties: {
        builder: {
          type: "string",
          enum: BUILDER_IDS,
          description:
            "The single best-fit builder chosen by fit (do NOT default to Zeps).",
        },
        reason: {
          type: "string",
          description: "One short sentence on why this builder fits the scoped need.",
        },
        prompt: {
          type: "string",
          description:
            "A concise build brief synthesised from the scoping answers, used to pre-fill the builder.",
        },
      },
      required: ["builder", "reason", "prompt"],
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

type Handoff = { builder: BuilderId; reason: string; prompt: string };

function parseHandoff(rawArgs: string): Handoff {
  let parsed: { builder?: unknown; reason?: unknown; prompt?: unknown } = {};
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    parsed = {};
  }
  const builder = BUILDER_IDS.includes(parsed.builder as BuilderId)
    ? (parsed.builder as BuilderId)
    : // Never silently fall back to Zeps; default to the most general builder.
      "replit";
  return {
    builder,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
  };
}

function buildResult(
  message: string,
  tools: ApiTool[],
  handoff: Handoff | null,
): ChatResult {
  return {
    message,
    tools,
    noMatch: tools.length === 0,
    stage: handoff ? "handoff" : "chat",
    recommendedBuilder: handoff?.builder ?? null,
    buildPrompt: handoff?.prompt ?? null,
  };
}

export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  const found = new Map<string, ApiTool>();
  let handoff: Handoff | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [SEARCH_TOOL, HANDOFF_TOOL],
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;
    messages.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const message = choice.content ?? "";
      // At hand-off the closing line need not re-name a tool, so don't gate the
      // returned tools on the message text — there are none to recommend.
      const recommended = handoff ? [] : pickRecommended(found, message);
      return buildResult(message, recommended, handoff);
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      if (call.function.name === "hand_off_to_builder") {
        handoff = parseHandoff(call.function.arguments);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: true,
            note: "Hand-off recorded. Write one warm closing sentence naming this builder and why, and mention the platform team on Slack as an alternative.",
          }),
        });
        continue;
      }

      let query = "";
      try {
        query = String(JSON.parse(call.function.arguments || "{}").query ?? "");
      } catch {
        query = "";
      }
      const results = await searchCatalogue(query, 6);
      // Drop weak matches before the agent ever sees them: anything below the
      // minimum-similarity threshold is only loosely related and must not be
      // recommendable. This reliably flips loosely-related asks onto the
      // build/request next-steps path instead of surfacing a bad fit.
      const strong = results.filter(
        (t) => (t.similarity ?? 0) >= MIN_MATCH_SIMILARITY,
      );
      for (const tool of strong) found.set(tool.id, tool);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(
          strong.length > 0
            ? strong.map((t) => ({
                id: t.id,
                name: t.name,
                type: t.types[0],
                oneLiner: t.oneLiner,
                tags: t.tags,
                similarity: Number((t.similarity ?? 0).toFixed(3)),
              }))
            : { results: [], note: "No tool met the relevance threshold for this query." },
        ),
      });
    }
  }

  // Exhausted turns without a clean final answer — surface what we found.
  if (handoff) {
    return buildResult(
      `Based on what you've described, I'd build this with ${
        BUILDER_LABELS[handoff.builder]
      }${handoff.reason ? ` — ${handoff.reason}` : ""}. You can also request it from the platform team on Slack.`,
      [],
      handoff,
    );
  }
  const fallback = [...found.values()].slice(0, 3);
  return buildResult(
    fallback.length > 0
      ? "Here are the closest matches I found."
      : "I couldn't find a tool for that in the catalogue yet. Tell me a bit more about what you need and I'll help you scope it.",
    fallback,
    null,
  );
}

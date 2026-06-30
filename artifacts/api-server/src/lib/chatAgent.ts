import type OpenAI from "openai";
import { openai, OPENAI_MODEL } from "./openaiClient";
import { searchCatalogue, MIN_MATCH_SIMILARITY, type ApiTool } from "./catalogue";

const MODEL = OPENAI_MODEL;
const MAX_TURNS = 8;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * The recommendation the concierge makes at the end of the funnel.
 *
 * Cheapest-path ordering (ascending cost/complexity):
 *   manual       — start without building; use a shared tracker, spreadsheet, or Slack workflow
 *   claude-skill — a reusable Claude skill (text-in / text-out, no UI, no hosting)
 *   replit       — full app or UI, confirmed integrations, small user count
 *   zeps         — no-code conversational agent or workflow
 *   real-app     — production-grade platform for many users / high-stakes
 */
export type BuilderId =
  | "manual"
  | "claude-skill"
  | "replit"
  | "claude-code"
  | "zeps"
  | "real-app";

const BUILDER_IDS: BuilderId[] = [
  "manual",
  "claude-skill",
  "replit",
  "claude-code",
  "zeps",
  "real-app",
];

const BUILDER_LABELS: Record<BuilderId, string> = {
  manual: "a manual-first approach (no build yet)",
  "claude-skill": "a Claude skill",
  replit: "Replit",
  "claude-code": "Claude Code",
  zeps: "Zeps",
  "real-app": "a full production platform",
};

/**
 * Where the build-gate funnel has landed for this reply:
 * - `chat`: a normal answer, clarifying question, match presentation, or one of
 *   the scoping questions — the build/Slack hand-off UI must NOT render.
 * - `handoff`: the funnel has cleared all four gates, so the hand-off UI may
 *   render with `recommendedBuilder` as the primary action.
 * - `register`: the user has signalled they already built something and want it
 *   listed in the catalogue; the UI switches to the add-tool paste-link flow.
 */
export type FunnelStage = "chat" | "handoff" | "register";

export type ChatResult = {
  message: string;
  tools: ApiTool[];
  /** True when no catalogue tool was recommended this turn. Drives nothing in
   *  the UI on its own anymore — the hand-off UI is gated on `stage`. */
  noMatch: boolean;
  stage: FunnelStage;
  /** Set only at the hand-off stage: the single best-fit path, chosen by cheapest-path-that-works. */
  recommendedBuilder: BuilderId | null;
  /** A concise build brief synthesised from the scoping answers, for pre-fill. */
  buildPrompt: string | null;
  /** Set only at the register stage: the URL captured from the user, or null if not yet provided. */
  registration: { url: string | null } | null;
};

const SYSTEM_PROMPT = `You are the concierge for the Headout AI Storefront — an internal meta-catalogue of the AI tools, apps, skills, docs, plugins, MCPs and Zeps that Headout teams have built.

Your job is to help a teammate FIND an existing internal tool before anyone builds anything new. You are a router, not a runner: never execute, operate, or pretend to operate any tool — only point people to the right one. Building is the END of a four-gate funnel, never a first move.

━━ REGISTRATION — CHECK THIS FIRST, BEFORE ANY SEARCH ━━
BEFORE doing anything else — before calling search_catalogue, before asking any question — decide if this message is registration intent.

Registration intent is ANY of these signals:
• "I built [something]" / "I made [something]" / "I finished building [something]"
• "how do I register [this/my tool]?" / "register my tool" / "add my tool"
• "I just finished building something, what do I do next?"
• "add [URL/tool] to the catalogue" / "list my tool"
• A raw URL that looks like something the user built or wants to add

If ANY of these match → call start_registration IMMEDIATELY. Do NOT call search_catalogue. Do NOT search. Do NOT ask a clarifying question first. Pass the url argument if a URL was provided.

After the tool call, write one warm sentence: registration happens right here in this chat, they can paste their link and it will be added. If a URL was already provided, confirm you've captured it.

Slack is ONLY for access or permission questions — NEVER the answer to "how do I register."

━━ GATE 1 — REUSE CHECK ━━
For every request that is NOT registration intent — including an explicit "build me X" — call search_catalogue before anything else. Rewrite vague asks into a concise capability description first. You may search again with different phrasing if results are weak.

If matches come back: present them (at most 3, genuine matches only; name each by its EXACT name from the results with one line on why it fits — the UI renders a card for every tool you name). Then ask plainly: does one of these cover your need, or is what you want meaningfully different?

Do NOT move toward building while a plausible match is unconfirmed. Only proceed to Gate 2 when the user confirms nothing fits.

━━ GATE 2 — CONCRETE SCENARIO ━━
Ask: "What's ONE concrete scenario this must handle?" The answer must name a TRIGGER (what event starts it), an ACTOR (who does it), and a DESIRED OUTCOME (what the actor gets).

If the user restates the mechanism instead of a real moment — for example "it pulls status from everywhere" or "it aggregates data automatically" — push back EXACTLY ONCE: "Can you give me a specific moment? Something like: [actor] needs to [trigger], and wants [outcome]." Do NOT proceed until you have a real scenario or the user has failed the one pushback. If they fail the pushback, accept what you have and continue.

━━ GATE 3 — FEASIBILITY ━━
For every system or data source the user has named (CRM, Slack, Google Calendar, etc.), ask: "For [system], is there an API or connector you can use, or is it manual / export-only / unsure?"

Ask about one system at a time if there are several. Record: confirmed-API, manual-only, or unsure.

If ANY key system is manual-only or unsure, you must NOT recommend a full automated build. The right call is manual-first (shared tracker, spreadsheet, or Slack workflow), automating only the feeds that have confirmed APIs.

━━ GATE 4 — AUDIENCE RECONCILIATION ━━
If the user's original framing named a team, a department, or a headcount (e.g. "30 people", "the ops team") but a later answer says "just me" or "only I'll use it", ask ONE reconciling question: "Just to make sure — is this for you alone, or does the whole [team/group] need it?" Do not silently collapse a team need into a personal tool.

━━ RECOMMENDATION ━━
Only AFTER all four gates are resolved, call record_recommendation EXACTLY ONCE — including for the manual/no-build path. The tool call is required for EVERY recommendation, whether you are saying "build this" or "don't build this yet". Without the tool call the recommendation is lost and the UI cannot render it. Pick the CHEAPEST PATH THAT ACTUALLY WORKS — in this order:

1. manual — when feasibility is unproven (manual-only or unsure systems) OR the audience is one person with low frequency. Tell the user plainly NOT to build the full app yet; recommend starting with a shared tracker, Slack workflow, or spreadsheet, and automating only what has a confirmed API.
2. claude-skill — when the need is repeatable text-in / text-out with no UI and no live system integrations required.
3. replit — when a UI is genuinely needed AND integrations are confirmed AND the user count is small.
4. zeps — when the need is a no-code conversational agent or workflow.
5. real-app — when there are many users, production requirements, or high-stakes data handling.

NEVER name a builder the feasibility answers contradict (e.g. do not recommend a full automated app when a key system is manual-only). NEVER default to Zeps or Replit out of habit.

After calling record_recommendation, write ONE warm closing sentence. It must name the recommended path AND reference the user's concrete scenario AND the feasible systems. If the recommendation is "manual", explicitly say not to build the full app yet and why. Also mention the platform team on Slack as an alternative.

Hard rules:
- Never recommend building before searching (EXCEPT registration intent — see REGISTRATION above).
- Never call search_catalogue when the user says "add my tool", "add my tool to the catalogue", "register my tool", "I built X", "I finished building", or any phrasing that means they want to list something they made. Those ALWAYS go to start_registration.
- Never call record_recommendation before all four gates are resolved.
- Never name or invent a tool that was not in the search results.
- If a request is genuinely ambiguous BEFORE you can even search, ask exactly one short clarifying question.
- Be concise and warm — no preamble, no markdown headers, never claim to run a tool yourself.`;

const SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_catalogue",
    description:
      "Search the internal Headout catalogue for tools matching a capability or problem. Returns the most relevant tools with id, name, type, one-liner and tags. Do NOT call this when the user has registration intent (e.g. 'add my tool', 'I built X', 'register my tool') — use start_registration instead.",
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
    name: "record_recommendation",
    description:
      "Record the final recommendation once all four gates are resolved: (1) reuse-check — user confirmed nothing existing fits, (2) concrete scenario with trigger+actor+outcome collected, (3) feasibility per named system captured (API confirmed or manual-only noted), (4) audience reconciled. REQUIRED for every outcome — including 'do not build yet' / manual-first paths. This is how the UI surfaces the recommendation; without this call the recommendation is invisible. Never call before all four gates are resolved.",
    parameters: {
      type: "object",
      properties: {
        builder: {
          type: "string",
          enum: BUILDER_IDS,
          description:
            "The cheapest path that actually works: manual > claude-skill > replit > claude-code > zeps > real-app. NEVER default to Zeps or Replit — pick by fit and feasibility.",
        },
        reason: {
          type: "string",
          description:
            "One short sentence on why this path fits — must reference the user's concrete scenario AND the feasible systems AND the reconciled audience.",
        },
        prompt: {
          type: "string",
          description:
            "A concise build brief synthesised from the scoping answers, used to pre-fill the builder (or empty string for the manual path).",
        },
      },
      required: ["builder", "reason", "prompt"],
      additionalProperties: false,
    },
  },
};

const REGISTER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "start_registration",
    description:
      "MUST be called (before search_catalogue) whenever the user signals they have already built or finished a tool and want it listed in the catalogue. Trigger phrases include — but are not limited to — 'I built X', 'how do I register this', 'register my tool', 'add my tool', 'add my tool to the catalogue', 'I just finished building something', 'what do I do now that I built this', or when the user pastes a URL to something they made. Do NOT call search_catalogue first. Do NOT ask a clarifying question first. Call this immediately, then tell the user registration happens right here.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The URL the user provided for their tool, if any. Omit (or pass empty string) if no URL was given yet.",
        },
        name: {
          type: "string",
          description:
            "The name of the tool the user mentioned, if any. Optional.",
        },
      },
      required: [],
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
    : // Never silently fall back to a specific builder; use the most conservative default.
      "manual";
  return {
    builder,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
  };
}

function parseRegistration(rawArgs: string): { url: string | null } {
  let parsed: { url?: unknown } = {};
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    parsed = {};
  }
  const url =
    typeof parsed.url === "string" && parsed.url.trim()
      ? parsed.url.trim()
      : null;
  return { url };
}

function buildResult(
  message: string,
  tools: ApiTool[],
  handoff: Handoff | null,
  registration: { url: string | null } | null = null,
): ChatResult {
  return {
    message,
    tools,
    noMatch: tools.length === 0,
    stage: registration ? "register" : handoff ? "handoff" : "chat",
    recommendedBuilder: handoff?.builder ?? null,
    buildPrompt: handoff?.prompt ?? null,
    registration,
  };
}

export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  const found = new Map<string, ApiTool>();
  let handoff: Handoff | null = null;
  let registration: { url: string | null } | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [REGISTER_TOOL, SEARCH_TOOL, HANDOFF_TOOL],
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;
    messages.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const message = choice.content ?? "";

      // If the LLM gave a text response without calling record_recommendation,
      // check whether the conversation has passed all four gates (no catalogue
      // matches + enough user turns = scoping is done). If so, force one final
      // call with tool_choice required so the recommendation is always recorded
      // as a proper handoff and the UI renders the card.
      if (handoff === null && registration === null && found.size === 0) {
        const userTurns = messages.filter((m) => m.role === "user").length;
        if (userTurns >= 3) {
          try {
            const forced = await openai.chat.completions.create({
              model: MODEL,
              messages: [
                ...messages,
                {
                  role: "system" as const,
                  content:
                    "All scoping information has been gathered. You MUST now call record_recommendation to register your recommendation — including if your recommendation is the manual/no-build path. The UI cannot surface the recommendation without this call.",
                },
              ],
              tools: [HANDOFF_TOOL],
              tool_choice: {
                type: "function",
                function: { name: "record_recommendation" },
              },
            });
            const forcedChoice = forced.choices[0]?.message;
            if (forcedChoice?.tool_calls) {
              for (const call of forcedChoice.tool_calls) {
                if (call.type !== "function") continue;
                if (call.function.name === "record_recommendation") {
                  handoff = parseHandoff(call.function.arguments);
                  break;
                }
              }
            }
          } catch {
            // Forced finalization failed — fall through with text-only result.
          }
        }
      }

      // At hand-off the closing line need not re-name a tool, so don't gate the
      // returned tools on the message text — there are none to recommend.
      const recommended = handoff || registration ? [] : pickRecommended(found, message);
      return buildResult(message, recommended, handoff, registration);
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      if (call.function.name === "start_registration") {
        registration = parseRegistration(call.function.arguments);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: true,
            note: registration.url
              ? "Registration started with the provided URL. Write one warm sentence telling the user you've captured the link and will kick off registration right here in this conversation — no need to go anywhere else."
              : "Registration flow started. Write one warm sentence telling the user that registration happens right here in this conversation — they can paste their tool's link and it will be added to the catalogue.",
          }),
        });
        continue;
      }

      if (call.function.name === "record_recommendation") {
        handoff = parseHandoff(call.function.arguments);
        const isManual = handoff.builder === "manual";
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: true,
            note: isManual
              ? "Recommendation recorded (manual-first path). Write one warm closing sentence telling the user NOT to build the full app yet, name the manual-first approach and why, reference their concrete scenario and the systems without confirmed APIs, and mention the platform team on Slack."
              : "Recommendation recorded. Write one warm closing sentence naming this builder and why, referencing the user's concrete scenario and the confirmed systems, and mention the platform team on Slack as an alternative.",
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
  if (registration) {
    return buildResult(
      "Sure — paste your tool's link here and I'll add it to the catalogue.",
      [],
      null,
      registration,
    );
  }
  if (handoff) {
    const isManual = handoff.builder === "manual";
    return buildResult(
      isManual
        ? `I'd recommend starting without building yet${handoff.reason ? ` — ${handoff.reason}` : ""}. You can also request it from the platform team on Slack.`
        : `Based on what you've described, I'd build this with ${
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

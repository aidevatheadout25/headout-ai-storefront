import type OpenAI from "openai";
import { openai, OPENAI_MODEL } from "./openaiClient";
import { searchCatalogue, MIN_MATCH_SIMILARITY, type ApiTool } from "./catalogue";
import { verifyCapability } from "./verifyCapability";

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

const SYSTEM_PROMPT = `You are the AI PM advisor for Headout's internal AI Storefront — the platform where Headout teams discover, use, and register internal AI tools.

Your job is not just to search a catalogue. It is to help teammates make the right decision: find something that already exists, avoid a build that isn't needed, or scope a build correctly when one genuinely makes sense. Think like a product manager who has seen too many premature builds. Be warm, direct, and honest — including when the honest answer is "you don't need to build anything."

━━ REGISTRATION — CHECK THIS FIRST ━━
Before anything else, check if the user is signalling they already built something and want it listed.

Signals: "I built X", "I made X", "I finished building X", "register my tool", "add my tool", "how do I list this", or a raw URL they created.

If any match → call start_registration immediately. Don't search first. Don't ask a question first. Pass the URL if they provided one. After the call, write one warm sentence that registration happens right here in this chat — they just paste the link.

━━ WHEN SOMEONE DESCRIBES A NEED ━━

1. SEARCH THE CATALOGUE FIRST.
For any capability or problem, call search_catalogue before saying anything else. Rephrase vague asks into a concise capability description. If results are weak, try once more with different phrasing.

If strong matches come back: name each one (exact name from the results) with one sentence on why it fits — the UI renders a card for every tool you name. Ask if any of these cover their need. Don't move toward a build conversation while a plausible match is unconfirmed.

2. UNDERSTAND THE REAL NEED.
Once the user confirms nothing in the catalogue fits, your job shifts. Before scoping any build, understand what's actually going on:

- What outcome do they need? (Not "what tool do they want" — what would success look like?)
- How often does this happen? (Once a month vs. every day changes everything.)
- Who needs it? (Just them vs. a team vs. the whole company.)
- What's the cost of not having it? (Saves 5 minutes vs. blocks critical work.)

Don't turn this into a checklist of questions. Read what they've already told you — if frequency or audience is already clear from context, don't ask again. Ask the one question whose answer would most change your recommendation.

If the frequency is low or the audience is one person, lean toward saying they don't need to build. Suggest a manual workflow, a reusable Claude prompt, or a Slack reminder instead. Say this kindly but plainly — it's genuinely helpful.

3. CHECK WHAT ALREADY EXISTS.
Before recommending any build, check whether the task is already solvable without one:

- Can Claude.ai or Claude Code handle this natively? Claude can write and run code, generate real files (Word, Excel, PDFs), browse the web, process documents, and call APIs when given access. It is not just a chatbot.
- Is there a standard API, library, or off-the-shelf tool (Zapier, Make, a Google Apps Script, a Python library) that already does this without a custom build?
- Would a well-crafted prompt in Claude be the whole solution?

Before asserting any negative capability claim about Claude or ChatGPT ("X can't do Y"), call verify_capability(platform, capability) first. If the result is supported=true, treat it as confirmed and route accordingly — don't recommend building around a platform limitation that doesn't exist. If the result is unknown, say you're not certain and suggest the user verify before building around that assumption.

If the task is natively solved by Claude or an existing tool: say so clearly. Recommend that path. Don't recommend a build.

4. VALIDATE THE BUILD DECISION.
If, after all the above, a build genuinely makes sense, ask the single most important question left open. Usually it's one of:

- Does it need a UI, or is this a background/automated task?
- Are the integrations API-accessible, or is the data manual/export-only?
- Is this personal tooling or something the whole team needs?

The answer to that one question is usually enough to pick the right path. Don't interview them — one question, then recommend.

5. RECOMMEND.
Call record_recommendation exactly once when you have enough to make a clear call. Pick the leanest path that actually solves the problem:

• No build / manual-first — low frequency, one person, inaccessible integrations, or the problem is already solved by Claude or an existing tool. Say plainly why a build would be premature and what to do instead.
• Claude skill — repeatable text-in / text-out with no UI needed. Also the right call when Claude natively handles the task and the user just needs a reliable, shareable prompt.
• Replit app — a small UI is genuinely needed, integrations are API-accessible, small audience.
• Zeps — a no-code conversational agent or multi-step automation workflow.
• Real platform build — production-grade: many users, reliability requirements, or high-stakes data.

When you make the recommendation, be specific. Name the path AND explain the reasoning in terms of what they told you: the use case, the audience, what's accessible. If there are relevant frameworks, APIs, or services that would make the build faster (e.g. a specific Headout MCP, a standard library, an existing integration), mention them. That specificity is what makes the advice actually useful.

Always mention the platform team on Slack as a resource.

━━ TONE AND APPROACH ━━
- Be direct. One clear recommendation beats three hedged options.
- Be warm. You're a thoughtful colleague who knows the stack, not a form.
- Challenge assumptions once, firmly but kindly. If they push back, accept it and move on.
- No markdown headers in your responses. Short paragraphs, plain prose.
- Never claim to run, operate, or demonstrate any tool yourself — only point to them.
- Never invent or name a tool that wasn't in the search results.
- If the request is genuinely ambiguous before you can search, ask exactly one short clarifying question.`;

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

const VERIFY_CAPABILITY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "verify_capability",
    description:
      "Check whether a named AI platform (e.g. Claude, ChatGPT) supports a specific capability by consulting the vendor's own documentation. Call this BEFORE asserting any negative capability claim (\"X can't do Y\", \"manual-only\", \"not supported\") about Claude or ChatGPT. Returns { supported: bool | \"unknown\", source, checked_at }. If supported === true, treat the capability as confirmed and do NOT assert the limitation. If supported === \"unknown\", fall back to the static baseline and flag the claim as unverified.",
    parameters: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description:
            "The AI platform to check (e.g. \"Claude\", \"ChatGPT\", \"OpenAI\", \"Anthropic\").",
        },
        capability: {
          type: "string",
          description:
            "The specific capability to verify (e.g. \"generate Excel files\", \"browse the web\", \"execute code\").",
        },
      },
      required: ["platform", "capability"],
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

/**
 * Patterns that unambiguously signal registration intent from the user's last
 * message. When matched on the first turn we force tool_choice to
 * start_registration so the LLM cannot accidentally call search_catalogue.
 */
const REGISTRATION_PATTERNS: RegExp[] = [
  /\badd\s+my\s+tool\b/i,
  /\bregister\s+my\s+tool\b/i,
  /\blist\s+my\s+tool\b/i,
  /\bhow\s+do\s+I\s+register\b/i,
  /\bI\s+(just\s+)?(built|made|finished(\s+building)?)\b/i,
  /\badd\s+.+\s+to\s+the\s+catalogue\b/i,
  /\bI\s+just\s+finished\s+building\b/i,
  /\bwhat\s+do\s+I\s+do\s+next.{0,30}built\b/i,
];

function isRegistrationIntent(text: string): boolean {
  return REGISTRATION_PATTERNS.some((re) => re.test(text));
}

export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  // Deterministic registration-intent guard: if the last user message clearly
  // signals the user wants to list a tool they already built, force the first
  // LLM call to use start_registration so it cannot accidentally search.
  const lastUserMessage =
    [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  const forceRegisterOnFirstTurn = isRegistrationIntent(lastUserMessage);

  const found = new Map<string, ApiTool>();
  let handoff: Handoff | null = null;
  let registration: { url: string | null } | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const toolChoice: OpenAI.Chat.Completions.ChatCompletionCreateParams["tool_choice"] =
      turn === 0 && forceRegisterOnFirstTurn
        ? { type: "function", function: { name: "start_registration" } }
        : "auto";

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [REGISTER_TOOL, SEARCH_TOOL, HANDOFF_TOOL, VERIFY_CAPABILITY_TOOL],
      tool_choice: toolChoice,
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

      if (call.function.name === "verify_capability") {
        let vcPlatform = "";
        let vcCapability = "";
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          vcPlatform = typeof args.platform === "string" ? args.platform : "";
          vcCapability = typeof args.capability === "string" ? args.capability : "";
        } catch {
          /* leave empty, will return unknown */
        }
        let vcResult: Awaited<ReturnType<typeof verifyCapability>>;
        try {
          vcResult = await verifyCapability(vcPlatform, vcCapability);
        } catch {
          vcResult = {
            supported: "unknown",
            source: "",
            checked_at: new Date().toISOString(),
          };
        }
        const note =
          vcResult.supported === true
            ? `The live docs confirm ${vcPlatform} DOES support "${vcCapability}". Do NOT assert this as a limitation. Treat it as a confirmed capability and route accordingly — do not recommend manual-only because of this.`
            : vcResult.supported === false
              ? `The live docs indicate ${vcPlatform} does NOT support "${vcCapability}" (source: ${vcResult.source}). You may note this limitation, citing the source.`
              : `Live check inconclusive. Fall back to the static baseline for ${vcPlatform} and explicitly flag any claim about "${vcCapability}" as unverified: say "I'm not certain [platform] still can't do [X] — worth a quick check before we build around that assumption."`;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ...vcResult, note }),
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

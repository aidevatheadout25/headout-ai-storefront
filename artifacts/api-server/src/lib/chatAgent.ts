import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "./anthropicClient";
import {
  searchCatalogue,
  listToolsByFilter,
  getToolById,
  getToolRowById,
  insertToolFlag,
  insertAccessRequest,
  verifyManageToken,
  updateTool,
  MIN_MATCH_SIMILARITY,
  type ApiTool,
} from "./catalogue";
import { verifyCapability } from "./verifyCapability";

const MODEL = CLAUDE_MODEL;
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
 * - `scope`: the user entered the Builder journey critique loop; the UI shows
 *   the scoping conversation without the normal handoff buttons.
 * - `brief`: the critique agent produced a requirements brief; the UI shows
 *   the editable BriefCard with a "Create my repo" button.
 * - `kill`: the critique agent called recommend_kill; the UI shows a kill card
 *   with an actionable alternative instead of a brief.
 * - `disambiguation`: off-script input detected mid-flow; the UI shows chips.
 */
export type FunnelStage =
  | "chat"
  | "handoff"
  | "register"
  | "scope"
  | "brief"
  | "kill"
  | "disambiguation";

export type BriefPayload = {
  conversationId?: string;
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] };
  problem: string;
  users: string;
  frequency: string;
  mustDo: string[];
  wontDo: string[];
  appClass: "micro" | "full";
  risk: "low" | "high";
};

export type KillPayload = {
  reason: string;
  alternative: string;
  alternativeUrl?: string;
};

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
  /** Set when stage === 'brief': the full draft brief produced by the critique agent. */
  briefPayload: BriefPayload | null;
  /** Set when stage === 'kill': reason + alternative from the critique agent. */
  killPayload: KillPayload | null;
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
Once the user confirms nothing in the catalogue fits, your job shifts. Before scoping any build, you need to silently weigh four things — but surface them to the user one at a time, never bundled:

- What outcome do they need? (Not "what tool do they want" — what would success look like?)
- How often does this happen? (Once a month vs. every day changes everything.)
- Who needs it? (Just them vs. a team vs. the whole company.)
- What's the cost of not having it? (Saves 5 minutes vs. blocks critical work.)

Read what they've already told you — skip any bullet already answered by context. Of what's left, ask only the single question whose answer would most change your recommendation, then stop and wait for their reply before asking the next one. If you catch yourself drafting a message that lists several of these as a multi-part question, cut it down to the one that matters most and hold the rest for a later turn.

If the frequency is low or the audience is one person, lean toward saying they don't need to build. Suggest a manual workflow, a reusable Claude prompt, or a Slack reminder instead. Say this kindly but plainly — it's genuinely helpful.

3. CHECK WHAT ALREADY EXISTS.
Before recommending any build, check whether the task is already solvable without one:

- Can Claude.ai or Claude Code handle this natively? Claude can write and run code, generate real files (Word, Excel, PDFs, CSVs, PowerPoint), browse the web, process documents, and call APIs when given access. It is not just a chatbot.
- Is there a standard API, library, or off-the-shelf tool (Zapier, Make, a Google Apps Script, a Python library) that already does this without a custom build?
- Would a well-crafted prompt in Claude be the whole solution?

FILE FORMAT RULE — memorise this, never override it: If the user wants output as a Word document, Excel file, PDF, CSV, PowerPoint, or any other standard file format, the answer is always "use Claude.ai directly — no build needed." Claude generates and lets you download these files natively. Never recommend a Replit app, Zeps workflow, or any custom build just to produce a file in a standard format.

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

━━ BROWSING THE CATALOGUE ━━
When a user wants to explore rather than search — "show me all data tools", "what has the ops team built?", "list all Claude skills" — call browse_catalogue with the appropriate type and/or team filters. Present results the same way as search: name each tool with one sentence on what it does. The UI renders a card for every tool you name.

Valid type values: app, skill, docs, mcp, plugin, script, slack-bot, zep.
Valid team values: Platform, Applied AI, Supply Ops, Growth, Content.

━━ TOOL DETAILS ━━
When a user asks about a specific tool — "tell me more about X", "who owns Y?", "what's the access level for Z?" — and you have its ID from a prior search or browse, call get_tool_details. Present the key facts in plain prose: what it does, the team, access requirements, and the link. Never fabricate details not in the result. If you don't have the tool's ID yet, run search_catalogue or browse_catalogue first.

━━ FLAGGING ISSUES ━━
When a user reports a problem — "the link is broken", "this tool is outdated", "the description is wrong" — identify the tool by name using search_catalogue if the ID is not already known, then call flag_tool with the ID and reason. Write a brief warm confirmation after. Valid reasons: broken-link, outdated, wrong-info, other.

━━ REQUESTING ACCESS ━━
When a user says they need access to a tool — "I need access to X", "how do I get access to Y?" — first check the tool's accessLevel. If it's open, tell them they can use it directly. If access is restricted (request or sensitive), ask what they'll use it for if not already stated, then call request_access(toolId, reason). Confirm warmly after.

━━ UPDATING YOUR TOOLS ━━
When a user wants to edit a tool they own — "update the URL for my tool", "change the description of X" — follow this sequence:
1. Confirm which tool and which field they want to change.
2. Confirm the new value.
3. Ask for their manage key: "You received a manage key when you first claimed this tool — it's a long string of letters and numbers. Paste it here and I'll apply the change."
4. Once you have all three, call update_tool. Never call it before step 3 is complete.

Updatable fields: url, title, oneLiner, description, status. If the manage key is wrong, say so and ask them to double-check. If they can't find it, direct them to the platform team on Slack.

━━ TONE AND APPROACH ━━
- One question per message, always — never stack multiple questions (even related ones from the same list) into a single reply. A message should contain at most one question mark. Ask, wait for the answer, then ask the next one if you still need it.
- Be direct. One clear recommendation beats three hedged options.
- Be warm. You're a thoughtful colleague who knows the stack, not a form.
- Challenge assumptions once, firmly but kindly. If they push back, accept it and move on.
- No markdown headers in your responses. Short paragraphs, plain prose.
- Never claim to run, operate, or demonstrate any tool yourself — only point to them.
- Never invent or name a tool that wasn't in the search results.
- If the request is genuinely ambiguous before you can search, ask exactly one short clarifying question.`;

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_catalogue",
  description:
    "Search the internal Headout catalogue for tools matching a capability or problem. Returns the most relevant tools with id, name, type, one-liner and tags. Do NOT call this when the user has registration intent (e.g. 'add my tool', 'I built X', 'register my tool') — use start_registration instead.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A concise natural-language description of the capability or problem the user wants a tool for.",
      },
    },
    required: ["query"],
  },
};

const HANDOFF_TOOL: Anthropic.Tool = {
  name: "record_recommendation",
  description:
    "Record the final recommendation once all four gates are resolved: (1) reuse-check — user confirmed nothing existing fits, (2) concrete scenario with trigger+actor+outcome collected, (3) feasibility per named system captured (API confirmed or manual-only noted), (4) audience reconciled. REQUIRED for every outcome — including 'do not build yet' / manual-first paths. This is how the UI surfaces the recommendation; without this call the recommendation is invisible. Never call before all four gates are resolved.",
  input_schema: {
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
  },
};

const VERIFY_CAPABILITY_TOOL: Anthropic.Tool = {
  name: "verify_capability",
  description:
    "Check whether a named AI platform (e.g. Claude, ChatGPT) supports a specific capability by consulting the vendor's own documentation. Call this BEFORE asserting any negative capability claim (\"X can't do Y\", \"manual-only\", \"not supported\") about Claude or ChatGPT. Returns { supported: bool | \"unknown\", source, checked_at }. If supported === true, treat the capability as confirmed and do NOT assert the limitation. If supported === \"unknown\", fall back to the static baseline and flag the claim as unverified.",
  input_schema: {
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
  },
};

const REGISTER_TOOL: Anthropic.Tool = {
  name: "start_registration",
  description:
    "MUST be called (before search_catalogue) whenever the user signals they have already built or finished a tool and want it listed in the catalogue. Trigger phrases include — but are not limited to — 'I built X', 'how do I register this', 'register my tool', 'add my tool', 'add my tool to the catalogue', 'I just finished building something', 'what do I do now that I built this', or when the user pastes a URL to something they made. Do NOT call search_catalogue first. Do NOT ask a clarifying question first. Call this immediately, then tell the user registration happens right here.",
  input_schema: {
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
  },
};

const BROWSE_TOOL: Anthropic.Tool = {
  name: "browse_catalogue",
  description:
    "List tools filtered by team and/or type when the user wants to browse or explore rather than search for a specific capability. Use for 'show me all data tools', 'what has the ops team built?', 'list all Claude skills'.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Filter by tool type. Valid values: app, skill, docs, mcp, plugin, script, slack-bot, zep. Omit to return all types.",
      },
      team: {
        type: "string",
        description:
          "Filter by team name (Platform, Applied AI, Supply Ops, Growth, Content). Omit to return all teams.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Defaults to 12.",
      },
    },
    required: [],
  },
};

const DETAIL_TOOL: Anthropic.Tool = {
  name: "get_tool_details",
  description:
    "Fetch full details about a specific tool when the user asks about it by name — 'how does X work?', 'who owns X?', 'what access level is X?'. Use the tool's ID from a prior search or browse.",
  input_schema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "The UUID of the tool to fetch details for.",
      },
    },
    required: ["toolId"],
  },
};

const FLAG_TOOL: Anthropic.Tool = {
  name: "flag_tool",
  description:
    "Report a problem with a tool on behalf of the user. Call when the user says a tool is broken, has a dead link, is outdated, or has incorrect information. Identify the tool ID from context or a prior search before calling.",
  input_schema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "The UUID of the tool being flagged.",
      },
      reason: {
        type: "string",
        enum: ["broken-link", "outdated", "wrong-info", "other"],
        description: "The category of the problem.",
      },
      details: {
        type: "string",
        description: "Optional extra detail the user provided about the issue.",
      },
    },
    required: ["toolId", "reason"],
  },
};

const ACCESS_TOOL: Anthropic.Tool = {
  name: "request_access",
  description:
    "Submit an access request for a tool that requires approval (accessLevel is 'request' or 'sensitive'). Ask for the user's reason before calling if they haven't provided one.",
  input_schema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "The UUID of the tool to request access for.",
      },
      reason: {
        type: "string",
        description: "Why the user needs access — what they will use the tool for.",
      },
    },
    required: ["toolId", "reason"],
  },
};

const UPDATE_TOOL_DEF: Anthropic.Tool = {
  name: "update_tool",
  description:
    "Update a field on a tool the user owns. Only call after: (1) user confirmed the tool and field, (2) user confirmed the new value, (3) user provided their manage key. Never call before all three.",
  input_schema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "The UUID of the tool to update.",
      },
      field: {
        type: "string",
        enum: ["url", "title", "oneLiner", "description", "status"],
        description: "The field to update.",
      },
      value: {
        type: "string",
        description: "The new value for the field.",
      },
      manageToken: {
        type: "string",
        description:
          "The manage key the user provided. Issued when the tool was claimed.",
      },
    },
    required: ["toolId", "field", "value", "manageToken"],
  },
};

const ALL_TOOLS: Anthropic.Tool[] = [
  REGISTER_TOOL,
  SEARCH_TOOL,
  BROWSE_TOOL,
  DETAIL_TOOL,
  FLAG_TOOL,
  ACCESS_TOOL,
  UPDATE_TOOL_DEF,
  HANDOFF_TOOL,
  VERIFY_CAPABILITY_TOOL,
];

// ─── Scope / Critique mode ────────────────────────────────────────────────────

const DRAFT_BRIEF_TOOL: Anthropic.Tool = {
  name: "draft_brief",
  description:
    "Call this once you have gathered enough information to write a requirements brief. Only call after the user has confirmed a genuine build need AND you have all required fields. Never call if recommend_kill is more appropriate.",
  input_schema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "One sentence: what problem does this solve?" },
      users: { type: "string", description: "Who uses it? (e.g. 'Supply Ops team, ~8 people')" },
      frequency: { type: "string", description: "How often? (e.g. 'daily', 'weekly', 'ad-hoc')" },
      mustDo: {
        type: "array",
        items: { type: "string" },
        description: "2–5 must-have capabilities. Be specific.",
      },
      wontDo: {
        type: "array",
        items: { type: "string" },
        description: "3+ explicit out-of-scope items to keep scope tight.",
      },
      appClass: {
        type: "string",
        enum: ["micro", "full"],
        description: "micro = simple script/skill/bot; full = proper UI + backend app.",
      },
      risk: {
        type: "string",
        enum: ["low", "high"],
        description: "low = internal tool, small audience; high = customer-facing or financial data.",
      },
    },
    required: ["problem", "users", "frequency", "mustDo", "wontDo", "appClass", "risk"],
  },
};

const RECOMMEND_KILL_TOOL: Anthropic.Tool = {
  name: "recommend_kill",
  description:
    "Call this when the idea should NOT be built: one-off task, already solvable natively by Claude, too risky, or clearly out of scope. Provide a concrete actionable alternative the user can do RIGHT NOW instead.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Plain-language explanation of why a build is not the right call.",
      },
      alternative: {
        type: "string",
        description: "The specific thing they can do instead (e.g. 'Use Claude.ai — paste the data and ask it to summarise', 'Set up a Slack reminder', 'Use the existing Reporting Tool in the catalogue').",
      },
      alternativeUrl: {
        type: "string",
        description: "An optional URL for the alternative (catalogue link, Claude.ai, Slack, etc.).",
      },
    },
    required: ["reason", "alternative"],
  },
};

const SCOPE_TOOLS: Anthropic.Tool[] = [DRAFT_BRIEF_TOOL, RECOMMEND_KILL_TOOL];

function buildScopeSystemPrompt(
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] },
): string {
  const nearMissLines =
    searchContext.nearMisses.length > 0
      ? searchContext.nearMisses
          .map((t) => `  • ${t.name}: ${t.oneLiner}`)
          .join("\n")
      : "  (none — no close catalogue matches)";

  return `You are a sharp Headout AI PM running a requirements critique session. The user searched the catalogue and found nothing adequate. Your job is to challenge the build idea, then either produce a tight requirements brief OR recommend not building it at all.

━━ SEARCH CONTEXT (do NOT ask the user to repeat this) ━━
Original query: "${searchContext.query}"
Near-misses from the catalogue:
${nearMissLines}

━━ YOUR APPROACH ━━
1. Ask ONE focused question at a time — maximum 6 questions total across the session.
2. Challenge grounded in the near-misses: ask if the existing tools could solve this with a workflow change.
3. After two justified pushbacks from the user ("no, that doesn't work because X"), concede and proceed.
4. Be direct. Warm but honest. No sycophancy. If it's a one-off task, say so plainly.

━━ KILL CRITERIA — call recommend_kill if ━━
- The task happens less than twice a week OR is a genuine one-off
- Claude.ai natively solves this with a good prompt (no build needed)
- The user only wants a file output (Word, Excel, PDF, CSV) — Claude does this natively
- The audience is one person and the frequency is low

━━ BRIEF CRITERIA — call draft_brief if ━━
- The task is repeated, affects more than one person, AND is NOT solvable by Claude natively
- You have gathered: problem, users, frequency, 2–5 must-dos, 3+ won't-dos, app class, risk level

━━ RULES ━━
- End with EXACTLY ONE call: either draft_brief or recommend_kill. No other outcome.
- Cap the session at 12 turns. If you hit the cap without enough info, make your best call.
- Never produce a brief as chat text — always use the draft_brief tool.
- Never invent information the user didn't provide.
- No markdown headers. Short paragraphs. One question mark per message.`;
}

/** Detect if the current chat is in scope/critique mode. */
function isScopeMode(history: ChatTurn[]): boolean {
  return history.some(
    (t) =>
      t.role === "user" &&
      /let['']?s?\s+scope\s+it|scope\s+this|scope\s+the\s+idea/i.test(t.content),
  );
}

/** Extract the search context from the chat history (last search query + near-misses). */
function extractSearchContext(
  history: ChatTurn[],
): { query: string; nearMisses: { name: string; oneLiner: string }[] } {
  const lastUserMsg = [...history]
    .reverse()
    .find((t) => t.role === "user" && !/let['']?s?\s+scope/i.test(t.content));
  return { query: lastUserMsg?.content.slice(0, 120) ?? "", nearMisses: [] };
}

function pickRecommended(found: Map<string, ApiTool>, message: string): ApiTool[] {
  const lower = message.toLowerCase();
  const named = [...found.values()].filter((t) =>
    lower.includes(t.name.toLowerCase()),
  );
  return named;
}

type Handoff = { builder: BuilderId; reason: string; prompt: string };

function parseHandoff(rawArgs: unknown): Handoff {
  const parsed = (typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;
  const builder = BUILDER_IDS.includes(parsed["builder"] as BuilderId)
    ? (parsed["builder"] as BuilderId)
    : "manual";
  return {
    builder,
    reason: typeof parsed["reason"] === "string" ? parsed["reason"] : "",
    prompt: typeof parsed["prompt"] === "string" ? parsed["prompt"] : "",
  };
}

function parseRegistration(rawArgs: unknown): { url: string | null } {
  const parsed = (typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;
  const url =
    typeof parsed["url"] === "string" && parsed["url"].trim()
      ? parsed["url"].trim()
      : null;
  return { url };
}

function buildResult(
  message: string,
  tools: ApiTool[],
  handoff: Handoff | null,
  registration: { url: string | null } | null = null,
  extra: {
    stage?: FunnelStage;
    briefPayload?: BriefPayload | null;
    killPayload?: KillPayload | null;
  } = {},
): ChatResult {
  const stage: FunnelStage =
    extra.stage ??
    (registration ? "register" : handoff ? "handoff" : "chat");
  return {
    message,
    tools,
    noMatch: tools.length === 0,
    stage,
    recommendedBuilder: handoff?.builder ?? null,
    buildPrompt: handoff?.prompt ?? null,
    registration,
    briefPayload: extra.briefPayload ?? null,
    killPayload: extra.killPayload ?? null,
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

export type ChatUserContext = {
  email?: string;
  userId?: string;
  conversationId?: string;
};

const SCOPE_MAX_TURNS = 12;

/** Run the critique/scope loop when the user chose "Let's scope it." */
async function runScopeChat(
  history: ChatTurn[],
  userContext?: ChatUserContext,
): Promise<ChatResult> {
  const searchContext = extractSearchContext(history);
  const systemPrompt = buildScopeSystemPrompt(searchContext);

  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  for (let turn = 0; turn < SCOPE_MAX_TURNS; turn++) {
    let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: SCOPE_TOOLS,
        tool_choice: { type: "auto" },
        messages,
        temperature: 0,
      });
    } catch {
      return buildResult(
        "Something went wrong with the critique session — let's try again.",
        [],
        null,
        null,
        { stage: "scope" },
      );
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      return buildResult(textBlock?.text ?? "", [], null, null, { stage: "scope" });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.name === "draft_brief") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        let brief: BriefPayload;
        try {
          brief = {
            conversationId: userContext?.conversationId,
            searchContext,
            problem: typeof args.problem === "string" ? args.problem : "",
            users: typeof args.users === "string" ? args.users : "",
            frequency: typeof args.frequency === "string" ? args.frequency : "",
            mustDo: Array.isArray(args.mustDo) ? (args.mustDo as string[]) : [],
            wontDo: Array.isArray(args.wontDo) ? (args.wontDo as string[]) : [],
            appClass: args.appClass === "full" ? "full" : "micro",
            risk: args.risk === "high" ? "high" : "low",
          };
        } catch {
          // Retry once with forced brief
          brief = {
            conversationId: userContext?.conversationId,
            searchContext,
            problem: "Build a tool to address the described need",
            users: "Internal team",
            frequency: "Regularly",
            mustDo: ["Core functionality"],
            wontDo: ["External integrations", "Mobile support", "Real-time collaboration"],
            appClass: "micro",
            risk: "low",
          };
        }

        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const message =
          textBlock?.text ||
          "I've put together a requirements brief based on our conversation. Review and edit it, then click Create my repo when you're ready.";

        return buildResult(message, [], null, null, {
          stage: "brief",
          briefPayload: brief,
        });
      }

      if (block.name === "recommend_kill") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        const kill: KillPayload = {
          reason:
            typeof args.reason === "string" ? args.reason : "This doesn't need a build.",
          alternative:
            typeof args.alternative === "string"
              ? args.alternative
              : "Use Claude.ai directly.",
          alternativeUrl:
            typeof args.alternativeUrl === "string" ? args.alternativeUrl : undefined,
        };
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const message =
          textBlock?.text || `${kill.reason} Instead: ${kill.alternative}`;

        return buildResult(message, [], null, null, {
          stage: "kill",
          killPayload: kill,
        });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify({ error: "Unknown tool" }),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit the turn cap — force a brief
  return buildResult(
    "We've been through quite a few questions. Let me put together a brief based on what you've told me.",
    [],
    null,
    null,
    { stage: "scope" },
  );
}

export async function runChat(history: ChatTurn[], userContext?: ChatUserContext): Promise<ChatResult> {
  // ── Scope / critique mode ─────────────────────────────────────────────────
  if (isScopeMode(history)) {
    return runScopeChat(history, userContext);
  }

  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const lastUserMessage =
    [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  const forceRegisterOnFirstTurn = isRegistrationIntent(lastUserMessage);

  const found = new Map<string, ApiTool>();
  let handoff: Handoff | null = null;
  let registration: { url: string | null } | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const toolChoice: Anthropic.MessageCreateParams["tool_choice"] =
      turn === 0 && forceRegisterOnFirstTurn
        ? { type: "tool", name: "start_registration" }
        : { type: "auto" };

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      tool_choice: toolChoice,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      const message = textBlock?.text ?? "";

      if (handoff === null && registration === null && found.size === 0) {
        const userTurns = messages.filter((m) => m.role === "user").length;
        if (userTurns >= 3) {
          try {
            const forced = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 8192,
              system:
                SYSTEM_PROMPT +
                "\n\nAll scoping information has been gathered. You MUST now call record_recommendation to register your recommendation — including if your recommendation is the manual/no-build path. The UI cannot surface the recommendation without this call.",
              tools: [HANDOFF_TOOL],
              tool_choice: { type: "tool", name: "record_recommendation" },
              messages: [
                ...messages,
                {
                  role: "user" as const,
                  content:
                    "Please record your recommendation now.",
                },
              ],
            });
            const forcedToolBlock = forced.content.find(
              (b): b is Anthropic.ToolUseBlock =>
                b.type === "tool_use" && b.name === "record_recommendation",
            );
            if (forcedToolBlock) {
              handoff = parseHandoff(forcedToolBlock.input);
            }
          } catch {
            // Forced finalization failed — fall through with text-only result.
          }
        }
      }

      const recommended = handoff || registration ? [] : pickRecommended(found, message);
      return buildResult(message, recommended, handoff, registration);
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.name === "start_registration") {
        registration = parseRegistration(block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({
            ok: true,
            note: registration.url
              ? "Registration started with the provided URL. Write one warm sentence telling the user you've captured the link and will kick off registration right here in this conversation — no need to go anywhere else."
              : "Registration flow started. Write one warm sentence telling the user that registration happens right here in this conversation — they can paste their tool's link and it will be added to the catalogue.",
          }),
        });
        continue;
      }

      if (block.name === "record_recommendation") {
        handoff = parseHandoff(block.input);
        const isManual = handoff.builder === "manual";
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({
            ok: true,
            note: isManual
              ? "Recommendation recorded (manual-first path). Write one warm closing sentence telling the user NOT to build the full app yet, name the manual-first approach and why, reference their concrete scenario and the systems without confirmed APIs, and mention the platform team on Slack."
              : "Recommendation recorded. Write one warm closing sentence naming this builder and why, referencing the user's concrete scenario and the confirmed systems, and mention the platform team on Slack as an alternative.",
          }),
        });
        continue;
      }

      if (block.name === "verify_capability") {
        const args = block.input as { platform?: string; capability?: string };
        const vcPlatform = typeof args.platform === "string" ? args.platform : "";
        const vcCapability = typeof args.capability === "string" ? args.capability : "";
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
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ ...vcResult, note }),
        });
        continue;
      }

      if (block.name === "browse_catalogue") {
        const browseArgs = block.input as { type?: string; team?: string; limit?: number };
        const browseResults = await listToolsByFilter({
          type: browseArgs.type,
          team: browseArgs.team,
          limit: browseArgs.limit ?? 12,
        });
        for (const tool of browseResults) found.set(tool.id, tool);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            browseResults.length > 0
              ? browseResults.map((t) => ({
                  id: t.id,
                  name: t.name,
                  type: t.types[0],
                  team: t.team,
                  oneLiner: t.oneLiner,
                  accessLevel: t.accessLevel,
                  status: t.status,
                }))
              : { results: [], note: "No tools found matching those filters." },
          ),
        });
        continue;
      }

      if (block.name === "get_tool_details") {
        const detailArgs = block.input as { toolId?: string };
        const tool = detailArgs.toolId ? await getToolById(detailArgs.toolId) : null;
        if (tool) found.set(tool.id, tool);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: tool
            ? JSON.stringify({
                id: tool.id,
                name: tool.name,
                type: tool.types[0],
                team: tool.team,
                oneLiner: tool.oneLiner,
                description: tool.description,
                accessLevel: tool.accessLevel,
                status: tool.status,
                owner: tool.owner.name,
                link: tool.link,
                tags: tool.tags,
              })
            : JSON.stringify({ error: "Tool not found." }),
        });
        continue;
      }

      if (block.name === "flag_tool") {
        const flagArgs = block.input as { toolId?: string; reason?: string; details?: string };
        let flagOk = false;
        if (flagArgs.toolId && flagArgs.reason) {
          try {
            await insertToolFlag({
              toolId: flagArgs.toolId,
              reason: flagArgs.reason,
              details: flagArgs.details,
              reporterEmail: userContext?.email,
            });
            flagOk = true;
          } catch { /* flagOk stays false */ }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            flagOk
              ? { ok: true, note: "Flag submitted. Write a warm one-sentence confirmation — the issue has been logged and the platform team will review it." }
              : { ok: false, note: "Flag could not be saved. Apologise briefly and ask them to report it directly on Slack." },
          ),
        });
        continue;
      }

      if (block.name === "request_access") {
        const accessArgs = block.input as { toolId?: string; reason?: string };
        let accessOk = false;
        if (accessArgs.toolId && accessArgs.reason) {
          try {
            await insertAccessRequest({
              toolId: accessArgs.toolId,
              reason: accessArgs.reason,
              requesterEmail: userContext?.email,
            });
            accessOk = true;
          } catch { /* accessOk stays false */ }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            accessOk
              ? { ok: true, note: "Access request submitted. Write a warm one-sentence confirmation — the request is logged and the tool owner will be in touch." }
              : { ok: false, note: "Request could not be saved. Apologise briefly and ask them to reach out to the tool owner directly on Slack." },
          ),
        });
        continue;
      }

      if (block.name === "update_tool") {
        const updateArgs = block.input as { toolId?: string; field?: string; value?: string; manageToken?: string };
        let updateNote = "";
        if (updateArgs.toolId && updateArgs.field && updateArgs.value && updateArgs.manageToken) {
          const row = await getToolRowById(updateArgs.toolId);
          if (!row) {
            updateNote = "Tool not found. Ask the user to confirm the tool name.";
          } else if (!verifyManageToken(row, updateArgs.manageToken)) {
            updateNote = "The manage key is incorrect. Ask the user to check it and try again — it was issued when they first claimed the tool.";
          } else {
            try {
              await updateTool(updateArgs.toolId, { [updateArgs.field]: updateArgs.value });
              updateNote = `Update applied. Write a warm one-sentence confirmation that the ${updateArgs.field} has been updated.`;
            } catch {
              updateNote = "The update failed. Ask them to try again or contact the platform team on Slack.";
            }
          }
        } else {
          updateNote = "Missing required arguments — need tool ID, field, new value, and manage key before calling update_tool.";
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ note: updateNote }),
        });
        continue;
      }

      // Default: search_catalogue
      const searchArgs = block.input as { query?: string };
      const query = typeof searchArgs.query === "string" ? searchArgs.query : "";
      const results = await searchCatalogue(query, 6);
      const strong = results.filter(
        (t) => (t.similarity ?? 0) >= MIN_MATCH_SIMILARITY,
      );
      for (const tool of strong) found.set(tool.id, tool);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
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

    messages.push({ role: "user", content: toolResults });
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

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
 * - `escalate`: the critique agent called escalate_to_eng; the UI shows a
 *   project-pitch card instead of a self-serve repo — this idea is too large
 *   or load-bearing for any self-serve path.
 * - `disambiguation`: off-script input detected mid-flow; the UI shows chips.
 */
export type FunnelStage =
  | "chat"
  | "handoff"
  | "register"
  | "scope"
  | "scope_exit"
  | "brief"
  | "kill"
  | "escalate"
  | "disambiguation";

/**
 * The shape a build should take — the reusable core of the critique agent's
 * decision. Replaces the old binary `appClass` (micro|full), which flattened
 * every non-app idea (an MCP server, a Claude skill, a Zep) into "micro" with
 * no way to express what it actually was.
 *
 *   no_build   — Claude-native or a genuine one-off; pairs with recommend_kill
 *   skill      — Claude skill: text-in, artifact-out, reusable, no hosting
 *   mcp        — machine-callable server exposing data/actions to agents;
 *                no UI, programmatic callers, typically high query volume
 *   zep        — a Zep on Headout's Zeps platform: a no-code multi-step
 *                workflow agent that orchestrates connectors (Slack/GitHub/
 *                Notion/etc.) and runs on triggers (web/API/Slack/WhatsApp/
 *                webhook/cron), built by chatting — no code, self-serve.
 *                The default for workflow/automation-shaped needs.
 *   script     — one-off or dev-side automation, not a persistent service
 *   micro_app  — small UI + backend, one job, small audience
 *   full_app   — multi-user UI + backend + multiple integrations
 *   eng_project — too large/critical/load-bearing for any self-serve path;
 *                pairs with escalate_to_eng, never with draft_brief
 */
export type Modality =
  | "no_build"
  | "skill"
  | "mcp"
  | "zep"
  | "script"
  | "micro_app"
  | "full_app"
  | "eng_project";

export type BriefPayload = {
  conversationId?: string;
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] };
  title?: string;
  problem: string;
  users: string;
  frequency: string;
  mustDo: string[];
  wontDo: string[];
  /** Never "no_build" or "eng_project" here — those pair with kill/escalate, not a brief. */
  modality: Modality;
  /** Why this modality and not another — the signal that decided it. */
  modalityReason: string;
  risk: "low" | "high";
};

export type KillPayload = {
  /** Always "no_build" — a kill call is by definition a no_build modality. */
  modality: "no_build";
  reason: string;
  alternative: string;
  alternativeUrl?: string;
};

/** Produced by escalate_to_eng: a short project pitch instead of a self-serve repo. */
export type EscalatePayload = {
  /** Always "eng_project" — an escalate call is by definition an eng_project modality. */
  modality: "eng_project";
  problem: string;
  whyLoadBearing: string;
  suggestedOwningTeams: string;
  roughShape: string;
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
  /** Set when stage === 'escalate': the project pitch from the critique agent. */
  escalatePayload: EscalatePayload | null;
  /** Set when stage === 'scope_exit' and the user's exit message carried an
   *  actionable request (e.g. "show me the registry instead") — the client
   *  should forward this as a new search instead of just acknowledging the exit. */
  forwardQuery: string | null;
};

const SYSTEM_PROMPT = `You are the AI PM advisor for Headout's internal AI Storefront — the platform where Headout teams discover, use, and register internal AI tools.

Your job is search and routing: find something that already exists, or plainly acknowledge when nothing does. You do not scope new builds yourself (see below). Be warm, direct, and honest.

━━ REGISTRATION — CHECK THIS FIRST ━━
Before anything else, check if the user is signalling they already built something and want it listed.

Signals: "I built X", "I made X", "I finished building X", "register my tool", "add my tool", "how do I list this", or a raw URL they created.

If any match → call start_registration immediately. Don't search first. Don't ask a question first. Pass the URL if they provided one. After the call, write one warm sentence that registration happens right here: paste a URL for apps/docs/Zeps/MCPs, or upload a SKILL.md for Claude/Cursor skills (file upload is skills-only — not PDFs or docs).

━━ WHEN SOMEONE DESCRIBES A NEED ━━

1. SEARCH THE CATALOGUE FIRST.
For any capability or problem, call search_catalogue before saying anything else. Rephrase vague asks into a concise capability description. If results are weak, try once more with different phrasing.

If strong matches come back: name each one (exact name from the results) with one sentence on why it fits — the UI renders a card for every tool you name. Ask if any of these cover their need.

2. NOTHING FITS → HAND OFF, DON'T INTERVIEW.
If nothing fits, say so in one plain sentence, e.g. "Nothing in the catalogue covers this — let's scope it properly." You do not run a scoping interview — you never ask about outcome, frequency, audience, or feasibility, and there is no record_recommendation tool or approval step for you to call. Do not attempt to recommend a builder, a path, or a "don't build this" verdict yourself, and do not narrate how the handoff works or who picks it up next — just acknowledge the gap and stop.

Scoping a build is NOT a separate team's job, not a different product, and not something that happens "elsewhere" — it happens right here, in this same chat, once the person confirms they want to build. Never say (or imply) any version of: "I'm not the right place for that," "take this to the team who can build it," "I don't scope," "there's nothing more I can do here," or "someone else handles that." If you catch yourself about to say the person needs to go somewhere else to scope a build, stop — say the one-line acknowledgement above instead and nothing more.

If the ask is too vague to search on at all (e.g. "I want to build something new" with no description of what), ask exactly one question — what are they trying to build — and stop there. Once they answer, search on that answer before doing anything else.

━━ CAPABILITY CLAIMS ━━
Before asserting any negative capability claim about Claude or ChatGPT ("X can't do Y"), call verify_capability(platform, capability) first. If the result is supported=true, treat it as confirmed — don't assert a limitation that doesn't exist. If the result is unknown, say you're not certain and suggest the user verify before assuming a limitation.

━━ PLATFORM TEAM ━━
Only ever mention the platform team on Slack for API keys, credentials, or access provisioning. Never for hosting, infra, architecture, or general build advice — that's not something to explain or route yourself.

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

━━ OFF-MISSION REQUESTS ━━
If the request has nothing to do with the catalogue, tools, or a build — creative writing, general trivia, small talk, anything not covered above — do NOT do the thing asked. Give a one-line warm redirect back to what this chat is for and stop there. Never produce the requested content first and redirect afterward (e.g. never write the poem/essay/joke and then mention what you actually do) — the redirect IS the entire response.

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
      title: {
        type: "string",
        description: "A short tool-style name for this tool, 2–4 words, title-cased. E.g. 'Experiment Compare', 'Report Compiler', 'Review Digest Bot'. NOT a sentence — a product name.",
      },
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
      modality: {
        type: "string",
        enum: ["skill", "mcp", "zep", "script", "micro_app", "full_app"],
        description:
          "The shape this should take — never 'no_build' or 'eng_project' here (those go through recommend_kill / escalate_to_eng instead, never draft_brief). " +
          "skill = Claude skill: text-in, artifact-out, reusable, no hosting. " +
          "mcp = machine-callable server exposing data/actions to agents — no UI, programmatic callers, typically high query volume, no human in the loop. " +
          "zep = a Zep on Headout's Zeps platform: a no-code multi-step workflow agent that orchestrates connectors (Slack/GitHub/Notion/etc.) and runs on triggers (web/API/Slack/WhatsApp/webhook/cron), built by chatting — no code, self-serve. This is the DEFAULT for any workflow/automation need built from connectors + triggers, not just scheduled pushes. " +
          "script = one-off or dev-side automation, not a persistent service. " +
          "micro_app = small UI + backend, one job, small audience — only pick this over zep if you can say why Zeps can't do it (needs a real custom UI, not just connectors and triggers). " +
          "full_app = multi-user UI + backend + multiple integrations — same caveat as micro_app.",
      },
      modalityReason: {
        type: "string",
        description: "One sentence: why this modality and not another — cite the specific signal (who/what calls it, volume, interactivity, data sensitivity).",
      },
      risk: {
        type: "string",
        enum: ["low", "high"],
        description:
          "high if the tool touches PII, financial data, or regulated/compliance-owned data (e.g. Legal, Procurement, Finance sign-off required), or is genuinely customer-facing. " +
          "low = purely internal, non-sensitive data, small blast radius if it breaks. " +
          "Never label an internal-only tool 'customer-facing' — check the actual audience before choosing high for that reason.",
      },
    },
    required: ["title", "problem", "users", "frequency", "mustDo", "wontDo", "modality", "modalityReason", "risk"],
  },
};

const RECOMMEND_KILL_TOOL: Anthropic.Tool = {
  name: "recommend_kill",
  description:
    "Call this when the idea should NOT be built: one-off task, already solvable natively by Claude, too risky, or clearly out of scope. This is the no_build modality by definition. Provide a concrete actionable alternative the user can do RIGHT NOW instead.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Plain-language explanation of why a build is not the right call (this doubles as the no_build justification).",
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

const ESCALATE_TOOL: Anthropic.Tool = {
  name: "escalate_to_eng",
  description:
    "Call this when the idea is too large, too critical, or too load-bearing for any self-serve path (a Claude skill, an MCP server, a Zep, a micro app, or a full app) — e.g. it touches every experience/every X, feeds a live production system, or genuinely needs multiple teams to own it. This is the eng_project modality by definition. Produces a short project pitch instead of a self-serve repo. NEVER call draft_brief for this case — a self-serve repo for something that needs an engineering team is a contradiction.",
  input_schema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "One sentence: what problem does this solve?" },
      whyLoadBearing: {
        type: "string",
        description: "Why this needs an engineering team, not a self-serve build — be specific (scale, criticality, blast radius, who else depends on it).",
      },
      suggestedOwningTeams: {
        type: "string",
        description: "Which team(s) should own this (e.g. 'Pricing and Data Science').",
      },
      roughShape: {
        type: "string",
        description: "A rough one- or two-sentence shape of what it would look like, for the project pitch — not a full spec.",
      },
    },
    required: ["problem", "whyLoadBearing", "suggestedOwningTeams", "roughShape"],
  },
};

const END_SCOPE_TOOL: Anthropic.Tool = {
  name: "end_scope",
  description:
    "Call this when the user wants to leave the scoping session (e.g. 'never mind', 'show me the registry', 'search for X instead', 'forget it'). Provide a short acknowledgement and, if the user's message contained an actionable request, surface it in forwardQuery so the client can act on it.",
  input_schema: {
    type: "object" as const,
    properties: {
      reason: {
        type: "string",
        description: "One-sentence acknowledgement of the exit (e.g. 'Got it — stepping out of scope mode.').",
      },
      forwardQuery: {
        type: "string",
        description: "Optional: the actionable query from the user's message to forward to normal search (e.g. 'show me the registry'). Omit if there is no actionable request.",
      },
    },
    required: ["reason"],
  },
};

/** The three terminal (conclusive) outcomes — always available. end_scope is a fourth, off-script exit, kept separate (see TERMINAL_SCOPE_TOOLS vs SCOPE_TOOLS). */
const TERMINAL_SCOPE_TOOLS: Anthropic.Tool[] = [DRAFT_BRIEF_TOOL, RECOMMEND_KILL_TOOL, ESCALATE_TOOL];

const SCOPE_TOOLS: Anthropic.Tool[] = [...TERMINAL_SCOPE_TOOLS, END_SCOPE_TOOL];

function buildScopeSystemPrompt(
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] },
): string {
  const nearMissLines =
    searchContext.nearMisses.length > 0
      ? searchContext.nearMisses
          .map((t) => `  • ${t.name}: ${t.oneLiner}`)
          .join("\n")
      : "  (none — no close catalogue matches)";

  return `You are a sharp Headout AI PM running a requirements critique session. The user searched the catalogue and found nothing adequate. Your job is to challenge the build idea, then land on exactly one of three outcomes: a tight requirements brief, a recommendation not to build it at all, or — if it's genuinely too big for self-serve — a project pitch for an engineering team.

━━ SEARCH CONTEXT (do NOT ask the user to repeat this) ━━
Original query: "${searchContext.query}"
Near-misses from the catalogue:
${nearMissLines}

━━ YOUR APPROACH ━━
1. OPEN WITH A CHALLENGE, not a data-gathering question. Your very first message must push back on the idea itself — kill it outright, propose reshaping it into something smaller, or point at a near-miss and ask why it doesn't already cover this. Only move to gathering requirements once the idea survives that pushback.
2. From there, ask ONE focused question at a time — maximum 6 questions total across the whole session. This is a sharp challenge, not gate-by-gate requirements gathering. The cap is enforced for you: once you've asked 6, your next turn only offers draft_brief, recommend_kill, or escalate_to_eng — no more questions will be possible, so use the six wisely and don't burn one re-asking something already covered.
3. After two justified pushbacks from the user ("no, that doesn't work because X"), concede and proceed.
4. Be direct. Warm but honest. No sycophancy. If it's a one-off task, say so plainly.
5. HANDLE NON-ANSWERS. If the user's reply doesn't actually address what you asked (they change topic, answer a different question, or say "not sure" / "doesn't matter"), do NOT ask the same question again. Make a reasonable, explicitly-stated assumption ("I'll assume weekly use since you didn't say") and move on to the next thing you need. Never ask the same question more than twice total, and prefer never repeating one at all.

━━ MODALITY — figure out the actual shape, don't default to "an app" ━━
Every brief must name a modality and justify it from a concrete signal in the conversation, not a guess. This is the single most important judgment call you make — a wrong modality (e.g. calling an MCP server a "micro app") hides the real shape of the work.

zep is the FIRST thing to consider for any workflow or automation need — it's Headout's self-serve substrate for exactly this: a no-code multi-step workflow agent built by chatting, orchestrating connectors (Slack/GitHub/Notion/etc.) and running on triggers (web/API/Slack/WhatsApp/webhook/cron). If the need is "when X happens, do Y across these systems" with no bespoke UI required, it's a zep — don't reach for micro_app/full_app by default. Only pick micro_app or full_app when you can state WHY Zeps can't serve it — typically because it needs a real custom UI (e.g. a file-upload + results dashboard) or a persistent multi-user product surface, not just connectors and triggers.

- Connector orchestration + triggers, no custom UI needed, "when X happens do Y" → zep (the default for workflow/automation asks)
- Agents/pipelines calling it programmatically, no human in the loop, steady or high query volume, no UI at all → mcp
- Same text-in, artifact-out steps repeated by one person or a small team, no persistent hosting needed → skill
- A fixed one-off dataset, a migration, dev-side tooling that isn't a persistent service → script (usually pairs with recommend_kill if it's truly one-time)
- A real custom UI (upload, dashboard, multi-step form) is required and Zeps genuinely can't cover it, for a small audience → micro_app
- Multiple users, multiple integrations, an actual application surface, and Zeps genuinely can't cover it → full_app
- It touches every X, feeds a live production system, or several teams would need to co-own it → eng_project (call escalate_to_eng, never draft_brief)
Ask whatever question you need to pin down modality (who/what calls it, how often, human-in-the-loop or not, does it need a real UI) — this can be one of your six questions, it doesn't need its own budget.

━━ KILL CRITERIA — call recommend_kill (modality: no_build) if ━━
- The task happens less than twice a week OR is a genuine one-off
- Claude.ai natively solves this with a good prompt (no build needed)
- The user only wants a file output (Word, Excel, PDF, CSV) — Claude does this natively
- The audience is one person and the frequency is low

━━ ESCALATE CRITERIA — call escalate_to_eng (modality: eng_project) if ━━
- It would touch every experience, every tool, or every record of some kind — broad, systemic reach, not a bounded slice
- It feeds or modifies a live production system (e.g. the pricing engine, the booking pipeline) rather than sitting alongside it
- Multiple teams would need to co-own it, or it's the kind of thing that needs a project pitch and a real engineering timeline, not a repo you can self-serve in a checklist
- If you find yourself about to say "this needs an engineering team" in plain text, that is the signal to call escalate_to_eng instead of saying it and stopping — never leave this as prose with no tool call, and never call draft_brief for it (a self-serve repo for something that needs an eng team is a contradiction)

━━ BRIEF CRITERIA — call draft_brief if ━━
- The task is repeated, affects more than one person or system, AND is NOT solvable by Claude natively AND is NOT an eng_project
- You have gathered: problem, users, frequency, 2–5 must-dos, 3+ won't-dos, modality + modalityReason, risk level

━━ RISK ━━
Risk is about blast radius and data sensitivity, not team size. Elevate to high whenever the tool touches PII, financial data, or data owned by a compliance-relevant team (Legal, Procurement, Finance) that requires their sign-off to expose — even if the tool itself is 100% internal-facing. Only call something "customer-facing" if the actual end users are customers, not Headout staff — an internal tool that happens to be important is not customer-facing.

━━ OFF-SCRIPT INPUT ━━
If the user says something that is clearly a mode-switch or off-topic (e.g. "show me the registry", "search for X instead", "never mind", "forget it"), call end_scope immediately. Do NOT call draft_brief, recommend_kill, or escalate_to_eng. Provide a short acknowledgement in the reason field and surface any actionable request in forwardQuery.

━━ RULES ━━
- End with EXACTLY ONE call: draft_brief, recommend_kill, or escalate_to_eng. No other outcome (unless off-script input, per above).
- Cap the session at 12 turns. If you hit the cap without enough info, make your best call — never leave the session hanging with no tool call.
- Never produce a brief, a kill verdict, or a project pitch as chat text — always use the matching tool.
- Never invent information the user didn't provide.
- No markdown headers. Short paragraphs. One question mark per message.
- Only mention the platform team on Slack for API keys, credentials, or access provisioning — never for hosting, infra, architecture, or general build advice.`;
}

/**
 * The last user message that isn't the "let's scope it" meta-trigger — i.e.
 * the actual problem description to search/scope on, not the chip text that
 * requested scoping. Used so a click/typed "let's scope it" doesn't itself
 * become the search query.
 */
function findMeaningfulUserMessage(history: ChatTurn[]): ChatTurn | undefined {
  return [...history]
    .reverse()
    .find((t) => t.role === "user" && !/let['']?s?\s+scope/i.test(t.content));
}

/** Extract the search context from the chat history (last user query, no near-misses). */
function extractSearchContext(
  history: ChatTurn[],
): { query: string; nearMisses: { name: string; oneLiner: string }[] } {
  const lastUserMsg = findMeaningfulUserMessage(history);
  return { query: lastUserMsg?.content.slice(0, 120) ?? "", nearMisses: [] };
}

function pickRecommended(found: Map<string, ApiTool>, message: string): ApiTool[] {
  const lower = message.toLowerCase();
  const named = [...found.values()].filter((t) =>
    lower.includes(t.name.toLowerCase()),
  );
  return named;
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
  registration: { url: string | null } | null = null,
  extra: {
    stage?: FunnelStage;
    briefPayload?: BriefPayload | null;
    killPayload?: KillPayload | null;
    escalatePayload?: EscalatePayload | null;
    forwardQuery?: string | null;
  } = {},
): ChatResult {
  const stage: FunnelStage = extra.stage ?? (registration ? "register" : "chat");
  return {
    message,
    tools,
    noMatch: tools.length === 0,
    stage,
    recommendedBuilder: null,
    buildPrompt: null,
    registration,
    briefPayload: extra.briefPayload ?? null,
    killPayload: extra.killPayload ?? null,
    escalatePayload: extra.escalatePayload ?? null,
    forwardQuery: extra.forwardQuery ?? null,
  };
}

/** The modalities draft_brief may legally claim — no_build/eng_project pair with the other two outcome tools, never this one. */
const VALID_BRIEF_MODALITIES: Modality[] = ["skill", "mcp", "zep", "script", "micro_app", "full_app"];

/**
 * Builds a BriefPayload from the model's draft_brief args, substituting a
 * clearly-marked default for any field that came back blank instead of
 * leaving it empty. draft_brief's JSON schema requires every field to be
 * *present*, not *non-empty* — a schema-compliant call can still hand back
 * "" or [] for a field the model didn't actually have an answer for. This is
 * the code-level backstop for "never draft an empty brief."
 */
function fillBriefDefaults(
  args: Record<string, unknown>,
  userContext: ChatUserContext | undefined,
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] },
): BriefPayload {
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

  const title = str(args.title) || undefined;
  const problem =
    str(args.problem) ||
    (searchContext.query
      ? `Not specified by the user — inferred from the original ask: "${searchContext.query}"`
      : "Not specified — the problem wasn't stated explicitly in the conversation.");
  const users = str(args.users) || "Not specified — assume the team that raised this need.";
  const frequency = str(args.frequency) || "Not specified — assume regular (at least weekly) use.";
  const mustDo = arr(args.mustDo);
  const wontDo = arr(args.wontDo);

  const modalityRaw = str(args.modality);
  const modality: Modality = VALID_BRIEF_MODALITIES.includes(modalityRaw as Modality)
    ? (modalityRaw as Modality)
    : "micro_app";
  const modalityReason =
    str(args.modalityReason) ||
    (VALID_BRIEF_MODALITIES.includes(modalityRaw as Modality)
      ? "Modality was named but not justified by the agent."
      : "Defaulted to micro_app — insufficient signal in the conversation to classify modality confidently.");

  const risk: "low" | "high" = args.risk === "high" ? "high" : "low";

  return {
    conversationId: userContext?.conversationId,
    searchContext,
    title,
    problem,
    users,
    frequency,
    mustDo: mustDo.length > 0 ? mustDo : ["Not specified — core functionality as described in the conversation."],
    wontDo: wontDo.length > 0 ? wontDo : ["Not specified — no explicit exclusions were discussed."],
    modality,
    modalityReason,
    risk,
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

/**
 * Patterns that signal the user wants to build something new, with enough
 * content to search on. Matched on the last user message to route straight
 * to a search-first-then-scope handoff instead of the concierge's own
 * scoping interview (there isn't one anymore — the critique agent owns it).
 */
const BUILD_INTENT_PATTERNS: RegExp[] = [
  /\bbuild\s+(?:me\b|a\b|an\b|my\b|our\b|some\b|something\b)/i,
  /\bwant(?:ing)?\s+to\s+build\b/i,
  /\btrying\s+to\s+build\b/i,
  /\bscope\s+(?:an|the|my)\s+idea\b/i,
  /\bnew\s+internal\s+tool\b/i,
];

/**
 * Fully generic build statements with no description of what's being built
 * (e.g. "I want to build something new"). These get one deterministic
 * clarifying question instead of a search — there's nothing to search on yet.
 */
const VAGUE_BUILD_PATTERNS: RegExp[] = [
  /^i(?:'m| am)\s+trying\s+to\s+build\s+something(?:\s+new)?\.?$/i,
  /^i\s+want\s+to\s+build\s+something(?:\s+new)?\.?$/i,
  /^i\s+want\s+to\s+build\s+(?:a|an)\s+(?:new\s+)?tool\.?$/i,
  /^build\s+something\s+new\.?$/i,
];

/** Deterministic clarifier for a vague build statement — see VAGUE_BUILD_PATTERNS. */
const BUILD_CLARIFIER_MESSAGE =
  "What are you building? Give me a short description of the problem and I'll check whether something already covers it.";

function isBuildIntent(text: string): boolean {
  return BUILD_INTENT_PATTERNS.some((re) => re.test(text));
}

function isVagueBuildIntent(text: string): boolean {
  return VAGUE_BUILD_PATTERNS.some((re) => re.test(text.trim()));
}

/** True when the turn right before the last user message was the deterministic build clarifier. */
function followsBuildClarifier(history: ChatTurn[]): boolean {
  if (history.length < 2) return false;
  const prior = history[history.length - 2];
  return prior.role === "assistant" && prior.content.trim() === BUILD_CLARIFIER_MESSAGE;
}

export type ChatUserContext = {
  email?: string;
  userId?: string;
  conversationId?: string;
  /** When 'scope', routes directly to the critique agent without regex history scan. */
  mode?: "scope";
  /** Near-miss tools from the last search — populated by the client when entering scope. */
  searchContext?: { query: string; nearMisses: { name: string; oneLiner: string }[] };
};

const SCOPE_MAX_TURNS = 12;

/**
 * Hard cap on assistant questions across the whole scope session, enforced in
 * code — not just prompt language. Counted from `history`, not an in-memory
 * counter, since each user message is a fresh runScopeChat call. Once this
 * many questions have already been asked, the NEXT call forces a terminal
 * tool call (draft_brief / recommend_kill / escalate_to_eng) instead of
 * letting the model ask a 7th question.
 */
const MAX_SCOPE_QUESTIONS = 6;

/** True when an assistant turn was a genuine question (ends in "?"), for the question-cap count. */
function isQuestionTurn(turn: ChatTurn): boolean {
  return turn.role === "assistant" && turn.content.trim().endsWith("?");
}

/**
 * Test-only seam: records the searchContext every runScopeChat call was
 * entered with, so tests can assert what travelled with a handoff without
 * depending on LLM phrasing. Untouched (null) in production.
 */
export const _testOverrides: {
  lastScopeSearchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] } | null;
} = { lastScopeSearchContext: null };

/** Run the critique/scope loop when the user chose "Let's scope it." */
async function runScopeChat(
  history: ChatTurn[],
  userContext?: ChatUserContext,
): Promise<ChatResult> {
  const searchContext = userContext?.searchContext ?? extractSearchContext(history);
  _testOverrides.lastScopeSearchContext = searchContext;
  const systemPrompt = buildScopeSystemPrompt(searchContext);

  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const questionsAskedSoFar = history.filter(isQuestionTurn).length;
  const atQuestionCap = questionsAskedSoFar >= MAX_SCOPE_QUESTIONS;

  for (let turn = 0; turn < SCOPE_MAX_TURNS; turn++) {
    // Once the cap is hit, force a conclusive call — no more free-form
    // questions, and end_scope isn't offered here since the cap forcing a
    // conclusion takes priority over an off-script exit on this exact turn.
    const tools = atQuestionCap ? TERMINAL_SCOPE_TOOLS : SCOPE_TOOLS;
    const toolChoice: Anthropic.MessageCreateParams["tool_choice"] = atQuestionCap
      ? { type: "any" }
      : { type: "auto" };

    let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        tool_choice: toolChoice,
        messages,
        temperature: 0,
      });
    } catch {
      return buildResult(
        "Something went wrong with the critique session — let's try again.",
        [],
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
      return buildResult(textBlock?.text ?? "", [], null, { stage: "scope" });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.name === "draft_brief") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        const brief: BriefPayload = fillBriefDefaults(args, userContext, searchContext);

        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const message =
          textBlock?.text ||
          "I've put together a requirements brief based on our conversation. Review and edit it, then click Create my repo when you're ready.";

        return buildResult(message, [], null, {
          stage: "brief",
          briefPayload: brief,
        });
      }

      if (block.name === "recommend_kill") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        const kill: KillPayload = {
          modality: "no_build",
          reason:
            typeof args.reason === "string" && args.reason
              ? args.reason
              : "This doesn't need a build.",
          alternative:
            typeof args.alternative === "string" && args.alternative
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

        return buildResult(message, [], null, {
          stage: "kill",
          killPayload: kill,
        });
      }

      if (block.name === "escalate_to_eng") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        const escalate: EscalatePayload = {
          modality: "eng_project",
          problem:
            typeof args.problem === "string" && args.problem
              ? args.problem
              : searchContext.query || "Not specified — inferred from the conversation.",
          whyLoadBearing:
            typeof args.whyLoadBearing === "string" && args.whyLoadBearing
              ? args.whyLoadBearing
              : "Too broad or critical for a self-serve build — needs an engineering team's judgment.",
          suggestedOwningTeams:
            typeof args.suggestedOwningTeams === "string" && args.suggestedOwningTeams
              ? args.suggestedOwningTeams
              : "Not specified — the owning team wasn't identified in this conversation.",
          roughShape:
            typeof args.roughShape === "string" && args.roughShape
              ? args.roughShape
              : "Not specified — needs an engineering scoping pass.",
        };
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const message =
          textBlock?.text ||
          `This needs an engineering team, not a self-serve build. ${escalate.whyLoadBearing}`;

        return buildResult(message, [], null, {
          stage: "escalate",
          escalatePayload: escalate,
        });
      }

      if (block.name === "end_scope") {
        const args = (block.input ?? {}) as Record<string, unknown>;
        const reason =
          typeof args.reason === "string" && args.reason
            ? args.reason
            : "Got it — stepping out of scope mode.";
        const forwardQuery =
          typeof args.forwardQuery === "string" && args.forwardQuery.trim()
            ? args.forwardQuery.trim()
            : null;
        return buildResult(reason, [], null, { stage: "scope_exit", forwardQuery });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify({ error: "Unknown tool" }),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit SCOPE_MAX_TURNS (the tool-round-trip safety valve, separate from the
  // question cap above) without a terminal call — force a filled brief
  // rather than leaving the session hanging with no outcome. fillBriefDefaults
  // marks every field as unspecified since the model gave us nothing here.
  return buildResult(
    "We've been through quite a few questions. Let me put together a brief based on what you've told me.",
    [],
    null,
    { stage: "brief", briefPayload: fillBriefDefaults({}, userContext, searchContext) },
  );
}

/** Deterministic presentation of a reuse match — no LLM call, so there's nothing to non-deterministically skip. */
function renderStrongMatchMessage(matches: ApiTool[]): string {
  if (matches.length === 1) {
    const m = matches[0];
    return `**${m.name}** already does this — ${m.oneLiner} Does that cover what you need, or is there a gap it doesn't handle?`;
  }
  const lines = matches.map((t) => `- **${t.name}** — ${t.oneLiner}`).join("\n");
  return `A few things in the catalogue already cover this:\n${lines}\n\nDo any of these work, or is there a gap they don't handle?`;
}

/**
 * Deterministic routing for a build-shaped ask (typed build intent, the
 * clarifier follow-up, or the "let's scope it" chip/text trigger).
 *
 * Phase 1 fix: this used to run through the concierge's own agentic tool
 * loop with tool_choice forced to search_catalogue only on turn 0. That made
 * "hand off to scope" depend on the LLM's tool call actually landing the way
 * the code expected — fragile, and impossible to reason about as a contract.
 * Now the search is a direct code call, and the branch (reuse vs. handoff) is
 * decided in code too. The concierge LLM is never involved in this decision.
 */
async function routeBuildShapedAsk(
  history: ChatTurn[],
  lastUserMessage: string,
  userContext: ChatUserContext | undefined,
): Promise<ChatResult> {
  const meaningful = findMeaningfulUserMessage(history);
  const query = (meaningful?.content ?? lastUserMessage).trim();
  const results = await searchCatalogue(query, 6);
  const strong = results.filter((t) => (t.similarity ?? 0) >= MIN_MATCH_SIMILARITY);

  if (strong.length === 0) {
    return runScopeChat(history, {
      ...userContext,
      searchContext: {
        query: query.slice(0, 120),
        nearMisses: results.slice(0, 3).map((t) => ({ name: t.name, oneLiner: t.oneLiner })),
      },
    });
  }

  return buildResult(renderStrongMatchMessage(strong), strong, null, { stage: "chat" });
}

export async function runChat(history: ChatTurn[], userContext?: ChatUserContext): Promise<ChatResult> {
  // ── Scope / critique mode — trust the explicit flag from the client ────────
  if (userContext?.mode === "scope") {
    return runScopeChat(history, userContext);
  }

  const lastUserMessage =
    [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  const forceRegisterOnFirstTurn = isRegistrationIntent(lastUserMessage);

  // Vague build statement with nothing to search on yet — ask the one
  // deterministic clarifying question and stop. No LLM call needed.
  if (
    !forceRegisterOnFirstTurn &&
    isVagueBuildIntent(lastUserMessage) &&
    !followsBuildClarifier(history)
  ) {
    return buildResult(BUILD_CLARIFIER_MESSAGE, [], null, { stage: "chat" });
  }

  // Build-shaped ask (typed intent, or the answer to the clarifier above) —
  // routed entirely in code (see routeBuildShapedAsk): search first, then
  // either return a reuse match or hand off straight to the critique agent.
  // The concierge LLM is never in the loop for this decision — see Phase 1
  // in the consolidated agent fix for why (the old tool-forced-on-turn-0
  // approach made the handoff depend on the LLM's tool call landing exactly
  // as expected, which wasn't reliable).
  const buildShaped =
    !forceRegisterOnFirstTurn &&
    (isBuildIntent(lastUserMessage) || followsBuildClarifier(history));

  if (buildShaped) {
    return routeBuildShapedAsk(history, lastUserMessage, userContext);
  }

  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const found = new Map<string, ApiTool>();
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
      const recommended = registration ? [] : pickRecommended(found, message);
      return buildResult(message, recommended, registration);
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
              : "Registration flow started. Write one warm sentence: paste a URL for apps, docs, Zeps, or MCPs; upload a SKILL.md only for Claude/Cursor skills. Do not suggest uploading PDFs or docs.",
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
      "Sure — paste a URL for apps, docs, Zeps, or MCPs. For a Claude/Cursor skill, upload a SKILL.md below (not a PDF or doc).",
      [],
      registration,
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

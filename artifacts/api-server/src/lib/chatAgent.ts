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
import {
  callDelphiTool,
  DELPHI_TOOL_NAMES,
  type DelphiToolName,
} from "./delphiClient";

const MODEL = CLAUDE_MODEL;
const MAX_TURNS = 10;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Streaming sink for the assistant's text as it's generated. Optional — when
 *  omitted (the eval, tests, and the non-streaming `/chat` route), the agent
 *  runs the identical blocking path it always has. */
export type OnDelta = (text: string) => void;

/**
 * Run one model turn. Behaviour is identical to `anthropic.messages.create`
 * and returns the same final Message; when `onDelta` is provided we use the
 * streaming API instead and forward text deltas as they arrive. Tool-use turns
 * emit little or no text; the user-facing final turn is what actually streams.
 */
async function runModelTurn(
  params: Anthropic.MessageCreateParamsNonStreaming,
  onDelta?: OnDelta,
): Promise<Anthropic.Message> {
  if (!onDelta) return anthropic.messages.create(params);
  const stream = anthropic.messages.stream(params);
  stream.on("text", (delta) => onDelta(delta));
  return stream.finalMessage();
}

/**
 * Vestigial from the superseded "cheapest-path builder" funnel. Kept only so
 * ChatResult / conversations.ts stay type-compatible; always null in practice.
 * (Slated for removal in a follow-up once the persistence layer drops it.)
 */
export type BuilderId =
  | "manual"
  | "claude-skill"
  | "replit"
  | "claude-code"
  | "zeps"
  | "real-app";

/**
 * Where the funnel has landed for this reply. In the unified agent (one LLM,
 * one message history) the stage is derived from *which tool the model called*,
 * not from regex-scanning prose:
 * - `chat`: discovery / browse / plain answer / a clarifying or gap question —
 *   catalogue cards may attach; the "nothing fits → scope" fork chip renders
 *   when `noMatch` is true.
 * - `register`: the model called start_registration.
 * - `scope`: the client flagged `mode:"scope"` (the user has entered the
 *   build-critique loop) and the model asked a critique question rather than
 *   concluding. No search tools exist in this mode, so the agent cannot
 *   re-surface a catalogue match it already ruled out — this is what kills the
 *   old "nothing fits ↔ X already does this" flip-flopping.
 * - `brief` / `kill` / `escalate`: the model called
 *   draft_brief / recommend_kill / escalate_to_eng.
 * - `scope_exit`: in scope mode the model called end_scope (user backed out);
 *   `forwardQuery` carries any search/browse to run outside scope.
 * `handoff` and `disambiguation` are retained in the union for client/type
 *   compatibility but are no longer emitted by the server.
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
 * The shape a build should take — the reusable core of the critique decision.
 *
 *   no_build   — Claude-native or a genuine one-off; pairs with recommend_kill
 *   skill      — Claude skill: text-in, artifact-out, reusable, no hosting
 *   mcp        — machine-callable server exposing data/actions to agents;
 *                no UI, programmatic callers, typically high query volume
 *   zep        — a Zep on Headout's Zeps platform: a no-code multi-step
 *                workflow agent orchestrating connectors on triggers. The
 *                default for workflow/automation-shaped needs.
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
  /** Never "no_build" or "eng_project" here — those pair with kill/escalate. */
  modality: Modality;
  modalityReason: string;
  risk: "low" | "high";
};

export type KillPayload = {
  modality: "no_build";
  reason: string;
  alternative: string;
  alternativeUrl?: string;
};

export type EscalatePayload = {
  modality: "eng_project";
  problem: string;
  whyLoadBearing: string;
  suggestedOwningTeams: string;
  roughShape: string;
};

export type ChatResult = {
  message: string;
  tools: ApiTool[];
  noMatch: boolean;
  stage: FunnelStage;
  /** Vestigial — always null. */
  recommendedBuilder: BuilderId | null;
  /** Vestigial — always null. */
  buildPrompt: string | null;
  registration: { url: string | null } | null;
  briefPayload: BriefPayload | null;
  killPayload: KillPayload | null;
  escalatePayload: EscalatePayload | null;
  /** Retained for type compatibility; the unified agent no longer emits scope_exit. */
  forwardQuery: string | null;
};

export type ChatUserContext = {
  email?: string;
  userId?: string;
  conversationId?: string;
  /** When 'scope', the user has entered the build-critique loop: the agent
   *  gathers requirements and concludes with draft_brief / recommend_kill /
   *  escalate_to_eng, and has NO search/browse tools (so it can't re-litigate
   *  reuse). Set by the client's fork chip / build-affirm, threaded on every
   *  subsequent turn until a terminal outcome resolves it. */
  mode?: "scope";
  /** Near-miss tools from the last search, passed by the client when entering
   *  scope so the critique agent can open by challenging a specific near-miss. */
  searchContext?: { query: string; nearMisses: { name: string; oneLiner: string }[] };
};

// ─── System prompt (single unified agent) ──────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are the AI PM advisor for Headout's internal AI Storefront — the platform where Headout teams discover, use, register, and scope internal AI tools. You handle the whole conversation yourself, end to end: finding something that already exists, honestly saying when nothing does, and — when the person wants to build — challenging the idea and scoping it right here. Be warm, direct, and honest.

━━ REGISTRATION — CHECK THIS FIRST ━━
Before anything else, check if the user is signalling they already built something and want it listed: "I built X", "I made X", "register my tool", "add my tool", "how do I list this", a raw URL they created, or "where do I upload my skill / SKILL.md".

If any match → call start_registration immediately. Don't search first, don't ask a question first. Pass the URL if they gave one. After the call, write one warm sentence: registration happens right here — paste a URL for apps/docs/Zeps/MCPs, or upload a SKILL.md for Claude/Cursor skills (file upload is skills-only, not PDFs/docs). Never promise an upload without calling start_registration.

━━ WHEN SOMEONE DESCRIBES A NEED ━━
1. SEARCH THE CATALOGUE FIRST. For any capability or problem, call search_catalogue before saying anything else. Rephrase vague asks into a concise capability description. If results are weak, try once more with different phrasing. "PRD" always means a Product Requirements Document — never a GitHub pull request; if search returns PR skills (create-pr, pr-describe) for a PRD ask, treat them as wrong and search again with "product requirements document" phrasing.

If strong matches come back: write 1–2 short framing sentences only — do NOT list tools, restate one-liners, or dump metadata (the UI renders a card for every result with name, summary, team, link). Ask if any cover their need. A one-sentence gap note ("covers X; falls short on Y") is fine when useful.

2. NOTHING FITS → SAY SO IN ONE SENTENCE, THEN STOP COMPLETELY. If nothing fits — or the user rejects the matches — your ENTIRE reply is one plain sentence that nothing in the catalogue covers it. That's the whole message. Do NOT ask a follow-up question. Do NOT ask what their ideal tool would do. Do NOT propose a build, a modality, or a rough scope. Do NOT advise whether they should build it, and do NOT suggest "just write a script" or "just use Claude for this" — deciding build-vs-no-build and critiquing the idea is the scoping step's job, not yours. The user's very next message automatically enters that scoping step (still you, still right here) — so you don't need to invite it, tee it up, or ask them to confirm. Never say or imply "I'm not the right place for that", "take this to another team", "I don't scope", or "there's nothing more I can do here". If the ask is too vague to search on at all ("I want to build something new" with no description), ask exactly one question — what are they trying to build — then search on their answer (this is the one allowed exception to the one-sentence rule, and it is a search clarifier, not scoping).

━━ CAPABILITY CLAIMS ━━
Before asserting any negative capability claim about Claude or ChatGPT ("X can't do Y"), call verify_capability(platform, capability). If supported=true, treat it as confirmed — don't assert a limitation that doesn't exist. If unknown, say you're not certain and suggest verifying before building around the assumption.

━━ HEADOUT KNOWLEDGE BEYOND THE CATALOGUE (Delphi) ━━
The catalogue is ONLY listed tools in our database. For anything beyond that — Headout repos, Notion/Coda/Google Docs, org policy, "where is X implemented?", "which repos use Y?" — call Delphi:
- delphi_ask: general Headout Q&A (full pipeline)
- delphi_search_docs: Notion/Coda/Google Docs RAG
- delphi_find_repos: discover relevant headout/* repos
- delphi_analyze_code: deep code analysis (pass repo_names when known; prefer find_repos first)
- delphi_classify: cheap routing flags before a heavier call
- delphi_fetch_page: pull a specific Notion/Coda/GDocs URL
Rules:
1. Listed tools → always search_catalogue / browse_catalogue / get_tool_details. Never use Delphi to answer what is or isn't in the catalogue.
2. After a weak/empty catalogue search, if they are asking whether related *code or docs* already exist, call delphi_find_repos or delphi_ask. Present findings as Headout knowledge / related repos — NEVER as catalogue cards, and NEVER invent a catalogue entry from Delphi.
3. Explicit KB asks (policies, how a domain works, pasted Notion/Coda/GDocs links) → Delphi. Still search the catalogue first when they are also looking for a listed tool.
4. If Delphi returns unavailable/error, say you couldn't reach Headout knowledge right now and continue with catalogue-only judgment.

━━ BROWSING / DETAILS / FLAGGING / ACCESS / UPDATES ━━
- NEVER state what is or isn't in the catalogue from memory. Always call search_catalogue or browse_catalogue first, and only describe what the tool actually returned — never invent counts ("we have 8 MCPs"), names, or availability.
- Browse ("show me all data tools", "what has ops built?", "list all MCPs"): call browse_catalogue with type/team filters. Present like search — framing only, cards own the listing. Valid types: app, skill, docs, mcp, plugin, script, slack-bot, zep. Valid teams: Platform, Applied AI, Supply Ops, Growth, Content.
- Tool details ("tell me more about X", "who owns Y?"): call get_tool_details with the ID from a prior search/browse. Present key facts in plain prose. Never fabricate details not in the result.
- Flagging ("link is broken", "outdated", "wrong info"): find the tool by name via search if needed, then flag_tool with ID + reason (broken-link, outdated, wrong-info, other). Warm one-sentence confirmation after.
- Access ("I need access to X"): check accessLevel. If open, they can use it directly. If restricted, ask what they'll use it for if not stated, then request_access(toolId, reason).
- Updating an owned tool: (1) confirm tool + field, (2) confirm new value, (3) ask for their manage key, then call update_tool. Never before step 3. Fields: url, title, oneLiner, description, status.

━━ PLATFORM TEAM ━━
Only ever mention the platform team on Slack for API keys, credentials, or access provisioning — never for hosting, infra, architecture, or general build advice.

━━ OFF-MISSION ━━
If the request has nothing to do with the catalogue, tools, a build, or Headout internal knowledge that Delphi can answer (creative writing, trivia, small talk), do NOT do the thing asked. Give a one-line warm redirect back to what this chat is for and stop. Never produce the requested content first — the redirect IS the entire response.

━━ TONE ━━
- One question per message, always — at most one question mark per reply. Ask, wait, then ask the next.
- Be direct: one clear recommendation beats three hedged options. Be warm: a thoughtful colleague who knows the stack, not a form.
- Challenge assumptions once, firmly but kindly. If they push back, accept it and move on.
- No markdown headers. Short paragraphs, plain prose.
- Never restate tool names/one-liners/teams in a list after a search/browse — cards show those. Never claim to run, operate, or demonstrate a tool. Never invent a tool that wasn't in the results.`;

/**
 * The scope-mode addendum. Appended to the base prompt when the client flags
 * mode:"scope". In this mode the tool set has NO search/browse — the agent has
 * already established the catalogue gap and must critique + conclude, not
 * re-search. The near-misses from the entering search are injected here so the
 * agent can open by challenging a specific one.
 */
function scopeSection(searchContext?: { query: string; nearMisses: { name: string; oneLiner: string }[] }): string {
  const nearMissLines =
    searchContext && searchContext.nearMisses.length > 0
      ? searchContext.nearMisses.map((t) => `  • ${t.name}: ${t.oneLiner}`).join("\n")
      : "  (none — no close catalogue matches)";
  const query = searchContext?.query ?? "";

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD-CRITIQUE MODE — the user has confirmed they want to build. The catalogue gap is already settled: nothing adequate exists, and you will NOT re-check or re-recommend the catalogue (treat that question as closed). NEVER mention your tools, their absence, "I can't search here", or any internal mechanics to the user — just do the work. Your job now: challenge the idea, then land on exactly one of three outcomes — a tight requirements brief (draft_brief), a recommendation not to build (recommend_kill), or a project pitch for an engineering team (escalate_to_eng).

━━ SEARCH CONTEXT (do NOT ask the user to repeat this) ━━
Original query: "${query}"
Near-misses from the catalogue:
${nearMissLines}

━━ APPROACH ━━
1. OPEN WITH A CHALLENGE, not a data-gathering question. Your first message must push back on the idea itself — kill it outright, propose reshaping it smaller, or point at a near-miss and ask why it doesn't already cover this. Only gather requirements once the idea survives.
2. Then ask ONE focused question at a time — max 6 across the whole session. This is a sharp challenge, not gate-by-gate requirements gathering. Once you've asked 6, the tools force a conclusion — spend them wisely, never re-ask something already answered.
3. After two justified pushbacks from the user ("no, that doesn't work because X"), concede and proceed.
4. Direct, warm, honest, no sycophancy. If it's a one-off, say so plainly.
5. HANDLE NON-ANSWERS: if a reply doesn't address what you asked, don't re-ask — make a reasonable, explicitly-stated assumption ("I'll assume weekly use since you didn't say") and move on. Never ask the same question more than twice.

━━ MODALITY — figure out the actual shape, don't default to "an app" ━━
Every brief names a modality justified from a concrete signal in the conversation. This is the most important judgment you make — a wrong modality (calling an MCP a "micro app") hides the real shape of the work.
zep is the FIRST thing to consider for any workflow/automation need — Headout's self-serve substrate: a no-code multi-step workflow agent orchestrating connectors (Slack/GitHub/Notion/etc.) on triggers (web/API/Slack/WhatsApp/webhook/cron). If it's "when X happens, do Y across these systems" with no bespoke UI, it's a zep. Only pick micro_app/full_app when you can state WHY Zeps can't serve it (needs a real custom UI or a persistent multi-user surface).
- Connector orchestration + triggers, no custom UI → zep (the default for workflow asks)
- Agents/pipelines calling it programmatically, no human in the loop, steady/high volume, no UI → mcp
- Same text-in, artifact-out steps repeated by a person/small team, no hosting → skill
- A fixed one-off dataset/migration/dev-side tooling → script (usually pairs with recommend_kill)
- A real custom UI required and Zeps genuinely can't cover it, small audience → micro_app
- Multiple users, multiple integrations, a real application surface, Zeps can't cover it → full_app
- Touches every X, feeds a live production system, or several teams must co-own it → eng_project (escalate_to_eng, never draft_brief)

━━ KILL vs BUILD — do NOT over-kill ━━
recommend_kill (modality no_build) ONLY when the task is genuinely one-off or rare (happens less than ~twice a month), OR it's a single ad-hoc thing one person needs once that Claude.ai answers in a single prompt. Always give a concrete alternative they can do right now.
DO NOT kill just because "Claude could do it with a good prompt" — that logic alone is a trap. If the same prompt/steps are run REPEATEDLY (roughly weekly or more) by a person or a team, that recurrence is exactly what a skill packages → draft_brief with modality skill, do NOT kill. "Claude can do it" justifies a kill only when it's also a genuine one-off.
A SCHEDULED or TRIGGERED automation across systems (e.g. "every morning pull X from the DB and post to Slack", "when a form is submitted, do Y") is NEVER no_build — Claude.ai cannot run on a schedule, hold connectors, or fire on triggers. That's a zep. Draft a brief.
Only-wants-a-file-output (Word/Excel/PDF/CSV) as a one-off → kill; but a recurring report generation for a team is still a skill or zep.

━━ ESCALATE (escalate_to_eng, modality eng_project) if ━━
- It would touch every experience/tool/record (systemic reach); OR feeds/modifies a live production system; OR multiple teams must co-own it. If you're about to say "this needs an engineering team" in prose, call escalate_to_eng instead. Never call draft_brief for this.

━━ BRIEF (draft_brief) if ━━
- Repeated, affects more than one person/system, NOT Claude-native, NOT an eng_project. You've gathered: problem, users, frequency, 2–5 must-dos, 3+ won't-dos, modality + modalityReason, risk.

━━ RISK ━━
Blast radius and data sensitivity, not team size. high whenever it touches PII, financial data, or data owned by a compliance-relevant team (Legal, Procurement, Finance) needing sign-off — even if 100% internal. Only "customer-facing" if the actual end users are customers, not Headout staff.

━━ DELPHI (beyond catalogue) ━━
Catalogue near-misses above are settled — do NOT re-search the catalogue. When you need Headout facts beyond those rows (how a domain works, whether code already does this, Notion/Coda/GDocs, which repos own a concern), call Delphi (delphi_ask / delphi_search_docs / delphi_find_repos / delphi_analyze_code / delphi_classify / delphi_fetch_page). Ground kill/reshape/modality claims in what Delphi returns. Never invent catalogue cards from Delphi results. If Delphi is unavailable, say so briefly and continue with conversation judgment.

━━ RULES ━━
- End with EXACTLY ONE terminal call: draft_brief, recommend_kill, or escalate_to_eng. Never produce a brief/kill/pitch as chat text — always use the tool.
- If the user signals they're done, disengaging, thanking you, or saying goodbye, do NOT trail into small talk or more questions — immediately make your best terminal call with what you have.
- OFF-SCRIPT EXIT: if the user changes their mind or asks to leave scoping ("never mind", "forget it", "show me the registry instead", "search for X instead"), call end_scope with a short acknowledgement and, if their message carried a search/browse request, put it in forwardQuery. Do NOT call draft_brief/recommend_kill/escalate_to_eng for an exit.
- Never invent information the user didn't provide. No markdown headers. One question mark per message.`;
}

// ─── Tool definitions ──────────────────────────────────────────────────────────

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_catalogue",
  description:
    "Search the internal Headout catalogue for tools matching a capability or problem. Returns the most relevant tools with id, name, type, one-liner, description and tags. Do NOT call for registration intent — use start_registration.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A concise natural-language description of the capability or problem the user wants a tool for.",
      },
    },
    required: ["query"],
  },
};

const VERIFY_CAPABILITY_TOOL: Anthropic.Tool = {
  name: "verify_capability",
  description:
    'Check whether a named AI platform (Claude, ChatGPT) supports a capability by consulting the vendor docs. Call BEFORE asserting any negative capability claim ("X can\'t do Y", "manual-only"). Returns { supported: bool | "unknown", source, checked_at }. If supported===true, do NOT assert the limitation. If "unknown", fall back to the baseline and flag the claim as unverified.',
  input_schema: {
    type: "object",
    properties: {
      platform: { type: "string", description: 'The AI platform (e.g. "Claude", "ChatGPT", "OpenAI").' },
      capability: { type: "string", description: 'The specific capability (e.g. "generate Excel files", "browse the web").' },
    },
    required: ["platform", "capability"],
  },
};

const REGISTER_TOOL: Anthropic.Tool = {
  name: "start_registration",
  description:
    "MUST be called (before search_catalogue) whenever the user signals they already built/finished a tool and want it listed, OR asks to upload/add a Claude/Cursor skill. Trigger phrases: 'I built X', 'register my tool', 'add my tool', 'where do I upload my SKILL.md', 'I have a claude skill', or a pasted URL to something they made. Do NOT search or ask a question first — the UI only shows the SKILL.md upload control after this runs.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL the user provided, if any. Omit if none yet." },
      name: { type: "string", description: "The tool name the user mentioned, if any. Optional." },
    },
    required: [],
  },
};

const BROWSE_TOOL: Anthropic.Tool = {
  name: "browse_catalogue",
  description:
    "List tools filtered by team and/or type when the user wants to browse rather than search for a capability. Use for 'show me all data tools', 'what has the ops team built?', 'list all Claude skills'.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", description: "Filter by type: app, skill, docs, mcp, plugin, script, slack-bot, zep. Omit for all." },
      team: { type: "string", description: "Filter by team: Platform, Applied AI, Supply Ops, Growth, Content. Omit for all." },
      limit: { type: "number", description: "Max results. Defaults to 12." },
    },
    required: [],
  },
};

const DETAIL_TOOL: Anthropic.Tool = {
  name: "get_tool_details",
  description:
    "Fetch full details about a specific tool when the user asks about it by name. Use the tool's ID from a prior search or browse.",
  input_schema: {
    type: "object",
    properties: { toolId: { type: "string", description: "The UUID of the tool." } },
    required: ["toolId"],
  },
};

const FLAG_TOOL: Anthropic.Tool = {
  name: "flag_tool",
  description:
    "Report a problem with a tool. Call when the user says a tool is broken, has a dead link, is outdated, or has wrong info. Identify the tool ID from context or a prior search first.",
  input_schema: {
    type: "object",
    properties: {
      toolId: { type: "string", description: "The UUID of the tool being flagged." },
      reason: { type: "string", enum: ["broken-link", "outdated", "wrong-info", "other"], description: "Category of the problem." },
      details: { type: "string", description: "Optional extra detail." },
    },
    required: ["toolId", "reason"],
  },
};

const ACCESS_TOOL: Anthropic.Tool = {
  name: "request_access",
  description:
    "Submit an access request for a tool requiring approval (accessLevel 'request' or 'sensitive'). Ask for the user's reason before calling if not provided.",
  input_schema: {
    type: "object",
    properties: {
      toolId: { type: "string", description: "The UUID of the tool." },
      reason: { type: "string", description: "Why the user needs access." },
    },
    required: ["toolId", "reason"],
  },
};

const UPDATE_TOOL_DEF: Anthropic.Tool = {
  name: "update_tool",
  description:
    "Update a field on a tool the user owns. Only after: (1) user confirmed tool + field, (2) confirmed new value, (3) provided their manage key. Never before all three.",
  input_schema: {
    type: "object",
    properties: {
      toolId: { type: "string", description: "The UUID of the tool." },
      field: { type: "string", enum: ["url", "title", "oneLiner", "description", "status"], description: "The field to update." },
      value: { type: "string", description: "The new value." },
      manageToken: { type: "string", description: "The manage key the user provided." },
    },
    required: ["toolId", "field", "value", "manageToken"],
  },
};

const DRAFT_BRIEF_TOOL: Anthropic.Tool = {
  name: "draft_brief",
  description:
    "Call once you have enough to write a requirements brief. Only after the user confirmed a genuine build need AND you have all required fields. Never if recommend_kill or escalate_to_eng is more appropriate.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short tool-style name, 2–4 words, title-cased (e.g. 'Experiment Compare', 'Review Digest Bot'). A product name, not a sentence." },
      problem: { type: "string", description: "One sentence: what problem does this solve?" },
      users: { type: "string", description: "Who uses it? (e.g. 'Supply Ops team, ~8 people')" },
      frequency: { type: "string", description: "How often? (e.g. 'daily', 'weekly', 'ad-hoc')" },
      mustDo: { type: "array", items: { type: "string" }, description: "2–5 must-have capabilities. Be specific." },
      wontDo: { type: "array", items: { type: "string" }, description: "3+ explicit out-of-scope items." },
      modality: {
        type: "string",
        enum: ["skill", "mcp", "zep", "script", "micro_app", "full_app"],
        description:
          "The shape this takes — never 'no_build' or 'eng_project' (those go through recommend_kill / escalate_to_eng). " +
          "zep = no-code workflow agent on Headout's Zeps platform, connectors + triggers, the DEFAULT for workflow/automation. " +
          "mcp = machine-callable server, no UI, programmatic callers, high volume. " +
          "skill = Claude skill, text-in/artifact-out, no hosting. " +
          "script = one-off/dev-side automation. " +
          "micro_app/full_app = only when Zeps genuinely can't (needs a real custom UI or multi-user surface).",
      },
      modalityReason: { type: "string", description: "One sentence: why this modality and not another — cite the specific signal (who/what calls it, volume, interactivity, data sensitivity)." },
      risk: {
        type: "string",
        enum: ["low", "high"],
        description:
          "high if it touches PII, financial data, or regulated/compliance-owned data (Legal/Procurement/Finance sign-off), or is genuinely customer-facing. low = purely internal, non-sensitive, small blast radius. Never label an internal-only tool 'customer-facing'.",
      },
    },
    required: ["title", "problem", "users", "frequency", "mustDo", "wontDo", "modality", "modalityReason", "risk"],
  },
};

const RECOMMEND_KILL_TOOL: Anthropic.Tool = {
  name: "recommend_kill",
  description:
    "Call when the idea should NOT be built: one-off task, already solvable natively by Claude, too risky, or out of scope. This is the no_build modality. Provide a concrete alternative the user can do RIGHT NOW.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why a build is not the right call (doubles as the no_build justification)." },
      alternative: { type: "string", description: "The specific thing to do instead (e.g. 'Use Claude.ai — paste the data and ask it to summarise')." },
      alternativeUrl: { type: "string", description: "Optional URL for the alternative." },
    },
    required: ["reason", "alternative"],
  },
};

const ESCALATE_TOOL: Anthropic.Tool = {
  name: "escalate_to_eng",
  description:
    "Call when the idea is too large/critical/load-bearing for any self-serve path — touches every experience/record, feeds a live production system, or needs multiple teams to own it. This is the eng_project modality. Produces a project pitch, NOT a self-serve repo. NEVER call draft_brief for this.",
  input_schema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "One sentence: what problem does this solve?" },
      whyLoadBearing: { type: "string", description: "Why this needs an engineering team, not self-serve — be specific (scale, criticality, blast radius, dependents)." },
      suggestedOwningTeams: { type: "string", description: "Which team(s) should own this (e.g. 'Pricing and Data Science')." },
      roughShape: { type: "string", description: "A rough one/two-sentence shape for the pitch — not a full spec." },
    },
    required: ["problem", "whyLoadBearing", "suggestedOwningTeams", "roughShape"],
  },
};

/** Anthropic-facing wrappers around Delphi MCP tools. Prefixed so they never collide with catalogue tools. */
const DELPHI_ASK_TOOL: Anthropic.Tool = {
  name: "delphi_ask",
  description:
    "Ask Delphi about Headout beyond the catalogue — repos, internal docs, org knowledge. Full pipeline (classify + code/docs/web). Do NOT use for catalogue listings; use search_catalogue for that. Never invent catalogue cards from the result.",
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The Headout question to ask." },
      links: {
        type: "array",
        items: { type: "string" },
        description: "Optional Notion/Coda/Google Docs URLs to include as context.",
      },
    },
    required: ["prompt"],
  },
};

const DELPHI_SEARCH_DOCS_TOOL: Anthropic.Tool = {
  name: "delphi_search_docs",
  description:
    "RAG search across Headout Notion, Coda, and Google Docs. Use for policies, process, and product docs — not for catalogue tool search.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Documentation question or search query." },
      pods: {
        type: "array",
        items: { type: "string" },
        description: "Optional pod/team name filters.",
      },
    },
    required: ["query"],
  },
};

const DELPHI_ANALYZE_CODE_TOOL: Anthropic.Tool = {
  name: "delphi_analyze_code",
  description:
    "Deep analysis of headout/* GitHub repos. Prefer delphi_find_repos first to scope repos, then call this with repo_names. Slow — use only when you need implementation detail.",
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Code question (e.g. where is pricing logic implemented?)." },
      repo_names: {
        type: "array",
        items: { type: "string" },
        description: "Optional headout/* repo names to scope the analysis.",
      },
    },
    required: ["prompt"],
  },
};

const DELPHI_CLASSIFY_TOOL: Anthropic.Tool = {
  name: "delphi_classify",
  description:
    "Classify a Headout query into code/doc/web routing flags and identified repos. Cheap pre-step before delphi_ask / delphi_analyze_code / delphi_search_docs.",
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The query to classify." },
    },
    required: ["prompt"],
  },
};

const DELPHI_FIND_REPOS_TOOL: Anthropic.Tool = {
  name: "delphi_find_repos",
  description:
    "Embedding-based discovery of relevant headout/* repos for a query. Use after a weak/empty catalogue search when asking whether related *code* already exists. Results are repos, not catalogue cards.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What capability or code area to find repos for." },
      max_repos: { type: "number", description: "Max repos to return (default 3)." },
    },
    required: ["query"],
  },
};

const DELPHI_FETCH_PAGE_TOOL: Anthropic.Tool = {
  name: "delphi_fetch_page",
  description:
    "Fetch content from a Headout Notion, Coda, or Google Docs URL. Use when the user pastes such a link or Delphi returned one.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Notion, Coda, or Google Docs URL." },
    },
    required: ["url"],
  },
};

const DELPHI_TOOLS: Anthropic.Tool[] = [
  DELPHI_ASK_TOOL,
  DELPHI_SEARCH_DOCS_TOOL,
  DELPHI_ANALYZE_CODE_TOOL,
  DELPHI_CLASSIFY_TOOL,
  DELPHI_FIND_REPOS_TOOL,
  DELPHI_FETCH_PAGE_TOOL,
];

const DELPHI_ANTHROPIC_NAMES = new Set(DELPHI_TOOLS.map((t) => t.name));

/** Discovery/concierge tools — available when NOT in scope mode. */
const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  REGISTER_TOOL,
  SEARCH_TOOL,
  BROWSE_TOOL,
  DETAIL_TOOL,
  FLAG_TOOL,
  ACCESS_TOOL,
  UPDATE_TOOL_DEF,
  VERIFY_CAPABILITY_TOOL,
  ...DELPHI_TOOLS,
];

const END_SCOPE_TOOL: Anthropic.Tool = {
  name: "end_scope",
  description:
    "Call when the user wants to LEAVE the scoping session without concluding — e.g. 'never mind', 'forget it', 'show me the registry instead', 'search for X instead', 'actually, let's look at existing tools'. Provide a short acknowledgement, and if their message carried an actionable request (a search/browse), surface it in forwardQuery so it can be handled outside scope.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "One-sentence acknowledgement of the exit (e.g. 'Got it — stepping out of scoping.')." },
      forwardQuery: { type: "string", description: "Optional: the actionable query from the user's message to forward to normal search/browse (e.g. 'show me the registry'). Omit if none." },
    },
    required: ["reason"],
  },
};

/** The three terminal outcomes — the conclusive exits from scope mode. */
const TERMINAL_SCOPE_TOOLS: Anthropic.Tool[] = [DRAFT_BRIEF_TOOL, RECOMMEND_KILL_TOOL, ESCALATE_TOOL];

/** Scope-mode tools: NO search/browse (can't re-litigate reuse). Delphi for Headout facts beyond the catalogue. verify_capability for honest kills, end_scope for a graceful off-script exit. */
const SCOPE_TOOLS: Anthropic.Tool[] = [
  ...TERMINAL_SCOPE_TOOLS,
  VERIFY_CAPABILITY_TOOL,
  END_SCOPE_TOOL,
  ...DELPHI_TOOLS,
];

const MAX_SCOPE_QUESTIONS = 6;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function parseRegistration(rawArgs: unknown): { url: string | null } {
  const parsed = (typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;
  const url = typeof parsed["url"] === "string" && parsed["url"].trim() ? parsed["url"].trim() : null;
  return { url };
}

const VALID_BRIEF_MODALITIES: Modality[] = ["skill", "mcp", "zep", "script", "micro_app", "full_app"];

/**
 * Build a BriefPayload from the model's draft_brief args, substituting clearly
 * marked defaults for any field that came back blank (the schema requires
 * fields present, not non-empty). When modality is missing/invalid we default
 * to `zep` — Headout's stated self-serve default — and say so explicitly,
 * rather than silently mislabeling it `micro_app` (the old masked default,
 * which was the exact "call an MCP a micro app" error to avoid).
 */
function fillBriefDefaults(
  args: Record<string, unknown>,
  userContext: ChatUserContext | undefined,
  searchContext: { query: string; nearMisses: { name: string; oneLiner: string }[] },
): BriefPayload {
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

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
  const modalityValid = VALID_BRIEF_MODALITIES.includes(modalityRaw as Modality);
  const modality: Modality = modalityValid ? (modalityRaw as Modality) : "zep";
  const modalityReason =
    str(args.modalityReason) ||
    (modalityValid
      ? "Modality was named but not justified by the agent."
      : "Low confidence — insufficient signal to classify modality; defaulted to Zeps (Headout's self-serve default). Confirm the shape before building.");

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

/** True when an assistant turn was a genuine question (ends in "?"), for the scope question cap. */
function isQuestionTurn(turn: ChatTurn): boolean {
  return turn.role === "assistant" && turn.content.trim().endsWith("?");
}

/** Deterministic framing of a reuse match — cards carry name/one-liner/link. */
function renderStrongMatchMessage(matches: ApiTool[]): string {
  return matches.length === 1
    ? "Something in the catalogue already looks like a fit — open the card for details and the link. Does that cover what you need, or is there a gap it doesn't handle?"
    : "A few things in the catalogue already look relevant — cards below have the summaries and links. Do any of these work, or is there a gap they don't handle?";
}

// ─── Tool execution (shared by both modes) ─────────────────────────────────────

/**
 * Execute a single concierge tool_use block against the catalogue and return
 * the tool_result content. Search/browse hits are recorded into `found` +
 * `lastCatalogueHits` (via the returned patch) so cards can attach.
 */
async function runConciergeToolLoop(
  messages: Anthropic.MessageParam[],
  userContext: ChatUserContext | undefined,
  onDelta?: OnDelta,
): Promise<ChatResult> {
  const found = new Map<string, ApiTool>();
  let lastCatalogueHits: ApiTool[] = [];
  let registration: { url: string | null } | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await runModelTurn(
      {
        model: MODEL,
        max_tokens: 8192,
        system: BASE_SYSTEM_PROMPT,
        tools: CONCIERGE_TOOLS,
        tool_choice: { type: "auto" },
        messages,
      },
      onDelta,
    );

    messages.push({ role: "assistant", content: response.content });
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      const recommended = registration ? [] : lastCatalogueHits.length > 0 ? lastCatalogueHits : [...found.values()];
      return buildResult(text, recommended, registration);
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
              ? "Registration started with the provided URL. Write one warm sentence: you've captured the link and will kick off registration right here — no need to go elsewhere."
              : "Registration flow started. Write one warm sentence: paste a URL for apps, docs, Zeps, or MCPs; upload a SKILL.md only for Claude/Cursor skills. Do not suggest uploading PDFs or docs.",
          }),
        });
        continue;
      }

      if (block.name === "verify_capability") {
        toolResults.push(await runVerifyCapability(block));
        continue;
      }

      if (DELPHI_ANTHROPIC_NAMES.has(block.name)) {
        toolResults.push(await runDelphiTool(block));
        continue;
      }

      if (block.name === "browse_catalogue") {
        const a = block.input as { type?: string; team?: string; limit?: number };
        const results = await listToolsByFilter({ type: a.type, team: a.team, limit: a.limit ?? 12 });
        lastCatalogueHits = results;
        for (const t of results) found.set(t.id, t);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            results.length > 0
              ? results.map((t) => ({ id: t.id, name: t.name, type: t.types[0], team: t.team, oneLiner: t.oneLiner, description: t.description, accessLevel: t.accessLevel, status: t.status }))
              : { results: [], note: "No tools found matching those filters." },
          ),
        });
        continue;
      }

      if (block.name === "get_tool_details") {
        const a = block.input as { toolId?: string };
        const tool = a.toolId ? await getToolById(a.toolId) : null;
        if (tool) found.set(tool.id, tool);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: tool
            ? JSON.stringify({ id: tool.id, name: tool.name, type: tool.types[0], team: tool.team, oneLiner: tool.oneLiner, description: tool.description, accessLevel: tool.accessLevel, status: tool.status, owner: tool.owner.name, link: tool.link, tags: tool.tags })
            : JSON.stringify({ error: "Tool not found." }),
        });
        continue;
      }

      if (block.name === "flag_tool") {
        const a = block.input as { toolId?: string; reason?: string; details?: string };
        let ok = false;
        if (a.toolId && a.reason) {
          try {
            await insertToolFlag({ toolId: a.toolId, reason: a.reason, details: a.details, reporterEmail: userContext?.email });
            ok = true;
          } catch { /* ok stays false */ }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            ok
              ? { ok: true, note: "Flag submitted. Write a warm one-sentence confirmation — logged, the platform team will review." }
              : { ok: false, note: "Flag could not be saved. Apologise briefly and ask them to report it on Slack." },
          ),
        });
        continue;
      }

      if (block.name === "request_access") {
        const a = block.input as { toolId?: string; reason?: string };
        let ok = false;
        if (a.toolId && a.reason) {
          try {
            await insertAccessRequest({ toolId: a.toolId, reason: a.reason, requesterEmail: userContext?.email });
            ok = true;
          } catch { /* ok stays false */ }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            ok
              ? { ok: true, note: "Access request submitted. Warm one-sentence confirmation — logged, the owner will be in touch." }
              : { ok: false, note: "Request could not be saved. Apologise briefly and ask them to reach the owner on Slack." },
          ),
        });
        continue;
      }

      if (block.name === "update_tool") {
        const a = block.input as { toolId?: string; field?: string; value?: string; manageToken?: string };
        let note = "";
        if (a.toolId && a.field && a.value && a.manageToken) {
          const row = await getToolRowById(a.toolId);
          if (!row) note = "Tool not found. Ask the user to confirm the tool name.";
          else if (!verifyManageToken(row, a.manageToken)) note = "The manage key is incorrect. Ask them to check it — it was issued when they claimed the tool.";
          else {
            try {
              await updateTool(a.toolId, { [a.field]: a.value });
              note = `Update applied. Warm one-sentence confirmation that the ${a.field} has been updated.`;
            } catch {
              note = "The update failed. Ask them to try again or contact the platform team on Slack.";
            }
          }
        } else note = "Missing required arguments — need tool ID, field, new value, and manage key.";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ note }) });
        continue;
      }

      if (block.name === "search_catalogue") {
        const a = block.input as { query?: string };
        const query = typeof a.query === "string" ? a.query : "";
        const results = await searchCatalogue(query, 6);
        const strong = results.filter((t) => (t.similarity ?? 0) >= MIN_MATCH_SIMILARITY);
        lastCatalogueHits = strong;
        for (const t of strong) found.set(t.id, t);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            strong.length > 0
              ? strong.map((t) => ({ id: t.id, name: t.name, type: t.types[0], oneLiner: t.oneLiner, description: t.description, tags: t.tags, similarity: Number((t.similarity ?? 0).toFixed(3)) }))
              : { results: [], note: "No tool met the relevance threshold for this query. If the user needs Headout repos/docs/org knowledge beyond listed tools, call Delphi next; otherwise say nothing in the catalogue covers it." },
          ),
        });
        continue;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Exhausted turns.
  if (registration) {
    return buildResult(
      "Sure — paste a URL for apps, docs, Zeps, or MCPs. For a Claude/Cursor skill, upload a SKILL.md below (not a PDF or doc).",
      [],
      registration,
    );
  }
  const fallback = lastCatalogueHits.length > 0 ? lastCatalogueHits.slice(0, 12) : [...found.values()].slice(0, 3);
  return buildResult(
    fallback.length > 0
      ? "Here are the closest matches I found — open a card for details and the link."
      : "I couldn't find a tool for that in the catalogue yet. Tell me a bit more about what you need and I'll help you scope it.",
    fallback,
    null,
  );
}

async function runVerifyCapability(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const args = block.input as { platform?: string; capability?: string };
  const platform = typeof args.platform === "string" ? args.platform : "";
  const capability = typeof args.capability === "string" ? args.capability : "";
  let result: Awaited<ReturnType<typeof verifyCapability>>;
  try {
    result = await verifyCapability(platform, capability);
  } catch {
    result = { supported: "unknown", source: "", checked_at: new Date().toISOString() };
  }
  const note =
    result.supported === true
      ? `The live docs confirm ${platform} DOES support "${capability}". Do NOT assert this as a limitation — treat it as confirmed and route accordingly.`
      : result.supported === false
        ? `The live docs indicate ${platform} does NOT support "${capability}" (source: ${result.source}). You may note this limitation, citing the source.`
        : `Live check inconclusive. Fall back to the static baseline for ${platform} and flag any claim about "${capability}" as unverified.`;
  return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ ...result, note }) };
}

function delphiMcpName(anthropicName: string): DelphiToolName | null {
  if (!anthropicName.startsWith("delphi_")) return null;
  const mcp = anthropicName.slice("delphi_".length);
  return (DELPHI_TOOL_NAMES as readonly string[]).includes(mcp) ? (mcp as DelphiToolName) : null;
}

function delphiArgsFromInput(mcpName: DelphiToolName, input: unknown): Record<string, unknown> {
  const a = (input ?? {}) as Record<string, unknown>;
  switch (mcpName) {
    case "ask": {
      const out: Record<string, unknown> = {
        prompt: typeof a.prompt === "string" ? a.prompt : "",
      };
      if (Array.isArray(a.links)) out.links = a.links.filter((u): u is string => typeof u === "string");
      return out;
    }
    case "search_docs": {
      const out: Record<string, unknown> = {
        query: typeof a.query === "string" ? a.query : "",
      };
      if (Array.isArray(a.pods)) out.pods = a.pods.filter((p): p is string => typeof p === "string");
      return out;
    }
    case "analyze_code": {
      const out: Record<string, unknown> = {
        prompt: typeof a.prompt === "string" ? a.prompt : "",
      };
      if (Array.isArray(a.repo_names)) {
        out.repo_names = a.repo_names.filter((r): r is string => typeof r === "string");
      }
      return out;
    }
    case "classify":
      return { prompt: typeof a.prompt === "string" ? a.prompt : "" };
    case "find_repos": {
      const out: Record<string, unknown> = {
        query: typeof a.query === "string" ? a.query : "",
      };
      if (typeof a.max_repos === "number" && Number.isFinite(a.max_repos)) out.max_repos = a.max_repos;
      return out;
    }
    case "fetch_page":
      return { url: typeof a.url === "string" ? a.url : "" };
    default: {
      const _exhaustive: never = mcpName;
      return _exhaustive;
    }
  }
}

async function runDelphiTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const mcpName = delphiMcpName(block.name);
  if (!mcpName) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify({ ok: false, error: `Unknown Delphi tool: ${block.name}` }),
    };
  }
  const result = await callDelphiTool(mcpName, delphiArgsFromInput(mcpName, block.input));
  if (!result.ok) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify({
        ok: false,
        unavailable: result.unavailable === true,
        error: result.error,
        note: result.unavailable
          ? "Delphi is not configured. Continue with catalogue-only judgment; do not invent Headout facts."
          : "Delphi call failed. Continue without inventing facts; you may retry with a narrower question once.",
      }),
    };
  }
  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: JSON.stringify({
      ok: true,
      source: "delphi",
      data: result.data,
      note: "This is Headout knowledge / repos / docs — NOT a Storefront catalogue listing. Do not invent catalogue cards from it.",
    }),
  };
}

// ─── Scope / critique loop ─────────────────────────────────────────────────────

async function runScopeChat(messages: Anthropic.MessageParam[], history: ChatTurn[], userContext?: ChatUserContext, onDelta?: OnDelta): Promise<ChatResult> {
  const searchContext = userContext?.searchContext ?? {
    query: [...history].reverse().find((t) => t.role === "user")?.content.slice(0, 120) ?? "",
    nearMisses: [],
  };
  const system = BASE_SYSTEM_PROMPT + scopeSection(searchContext);

  const questionsAsked = history.filter(isQuestionTurn).length;
  const atCap = questionsAsked >= MAX_SCOPE_QUESTIONS;
  const tools = atCap ? TERMINAL_SCOPE_TOOLS : SCOPE_TOOLS;
  const toolChoice: Anthropic.MessageCreateParams["tool_choice"] = atCap ? { type: "any" } : { type: "auto" };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await runModelTurn(
        {
          model: MODEL,
          max_tokens: 4096,
          system,
          tools,
          tool_choice: toolChoice,
          messages,
          temperature: 0,
        },
        onDelta,
      );
    } catch {
      return buildResult("Something went wrong with the critique session — let's try again.", [], null, { stage: "scope" });
    }

    messages.push({ role: "assistant", content: response.content });
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      return buildResult(text, [], null, { stage: "scope" });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name === "draft_brief") {
        const brief = fillBriefDefaults((block.input ?? {}) as Record<string, unknown>, userContext, searchContext);
        const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
        return buildResult(
          text || "I've put together a requirements brief based on our conversation. Review and edit it, then click Create my repo when you're ready.",
          [],
          null,
          { stage: "brief", briefPayload: brief },
        );
      }
      if (block.name === "recommend_kill") {
        const a = (block.input ?? {}) as Record<string, unknown>;
        const kill: KillPayload = {
          modality: "no_build",
          reason: typeof a.reason === "string" && a.reason ? a.reason : "This doesn't need a build.",
          alternative: typeof a.alternative === "string" && a.alternative ? a.alternative : "Use Claude.ai directly.",
          alternativeUrl: typeof a.alternativeUrl === "string" ? a.alternativeUrl : undefined,
        };
        const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
        return buildResult(text || `${kill.reason} Instead: ${kill.alternative}`, [], null, { stage: "kill", killPayload: kill });
      }
      if (block.name === "escalate_to_eng") {
        const a = (block.input ?? {}) as Record<string, unknown>;
        const escalate: EscalatePayload = {
          modality: "eng_project",
          problem: typeof a.problem === "string" && a.problem ? a.problem : searchContext.query || "Not specified — inferred from the conversation.",
          whyLoadBearing: typeof a.whyLoadBearing === "string" && a.whyLoadBearing ? a.whyLoadBearing : "Too broad or critical for a self-serve build — needs an engineering team's judgment.",
          suggestedOwningTeams: typeof a.suggestedOwningTeams === "string" && a.suggestedOwningTeams ? a.suggestedOwningTeams : "Not specified — the owning team wasn't identified.",
          roughShape: typeof a.roughShape === "string" && a.roughShape ? a.roughShape : "Not specified — needs an engineering scoping pass.",
        };
        const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
        return buildResult(text || `This needs an engineering team, not a self-serve build. ${escalate.whyLoadBearing}`, [], null, { stage: "escalate", escalatePayload: escalate });
      }
      if (block.name === "end_scope") {
        const a = (block.input ?? {}) as Record<string, unknown>;
        const reason = typeof a.reason === "string" && a.reason ? a.reason : "Got it — stepping out of scoping.";
        const forwardQuery = typeof a.forwardQuery === "string" && a.forwardQuery.trim() ? a.forwardQuery.trim() : null;
        return buildResult(reason, [], null, { stage: "scope_exit", forwardQuery });
      }
      if (block.name === "verify_capability") {
        toolResults.push(await runVerifyCapability(block));
        continue;
      }
      if (DELPHI_ANTHROPIC_NAMES.has(block.name)) {
        toolResults.push(await runDelphiTool(block));
        continue;
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ error: "Unknown tool" }) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Exhausted turns without a terminal call — force a filled brief.
  return buildResult(
    "We've been through quite a few questions. Let me put together a brief based on what you've told me.",
    [],
    null,
    { stage: "brief", briefPayload: fillBriefDefaults({}, userContext, searchContext) },
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function runChat(
  history: ChatTurn[],
  userContext?: ChatUserContext,
  onDelta?: OnDelta,
): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({ role: turn.role, content: turn.content }));

  // Build-critique mode: the client has flagged that the user entered the scope
  // loop. The agent gathers requirements and concludes with a terminal tool; it
  // has NO search/browse tools, so it cannot re-surface a match it already ruled
  // out. This is the structural fix for the old flip-flopping.
  if (userContext?.mode === "scope") {
    return runScopeChat(messages, history, userContext, onDelta);
  }

  // Otherwise: the unified discovery/concierge agent handles search, browse,
  // details, registration, flag, access, update, and capability checks. When
  // nothing fits it says so plainly (stage chat, noMatch true) and the client's
  // next turn enters scope.
  return runConciergeToolLoop(messages, userContext, onDelta);
}

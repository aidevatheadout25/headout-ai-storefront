/**
 * E2E conversation eval harness — simulated-user + LLM-judge edition.
 *
 * The old harness sent a FIXED script: a pre-written list of user messages
 * replayed regardless of what the agent actually asked. That structurally
 * manufactured non-answers (the agent asks "where does the data live?" and the
 * next scripted line is "the whole team, daily") and could only grade the final
 * stage — never whether the conversation was coherent, remembered what the user
 * said, or pushed back well.
 *
 * This version drives each scenario with a **simulated user**: an LLM given a
 * persona, a goal, and a set of hidden facts it reveals only when the agent
 * actually asks for them. It answers whatever the agent asks, in character. The
 * resulting transcript is then scored by an **LLM judge** on a conversation
 * rubric (coherence, context retention, no self-contradiction, pushback
 * quality, gap-note honesty, concision), on top of the existing hard structural
 * checks (terminal stage / modality / risk / brief completeness).
 *
 * This is a MEASUREMENT tool only. It does not fix anything it finds, and it is
 * deliberately NOT in the `test` glob (src/eval/*.test.ts) — it hits the network
 * (Anthropic for the agent, the simulated user, and the judge) and is
 * non-deterministic. Run it to produce a report, read the report, then make one
 * scoped fix pass elsewhere.
 *
 * Run with (needs DATABASE_URL + an Anthropic key in the environment):
 *   tsx src/eval/e2eConversations.ts
 *
 * Read-only against the catalogue, same as before: runChat's mutating tools
 * (start_registration only sets result.registration; flag/access/update) are
 * never triggered by the personas below. search/browse/details + embeddings +
 * the Anthropic calls hit the real network.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "../lib/anthropicClient";
import { isGapAcknowledgement, isScopeAffirm } from "../lib/buildIntent";
import {
  runChat,
  type BriefPayload,
  type ChatResult,
  type ChatTurn,
  type ChatUserContext,
  type EscalatePayload,
  type FunnelStage,
  type KillPayload,
  type Modality,
} from "../lib/chatAgent";
import { seedCatalogueIfEmpty } from "../lib/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, "e2e-report.md");

/** Cap on user↔agent exchanges per scenario, so a stuck conversation can't run forever. */
const MAX_EXCHANGES = 10;

// ─── Scenario definitions ───────────────────────────────────────────────────

type Scenario = {
  id: number;
  title: string;
  /** Who the simulated user is. */
  persona: string;
  /** What they want, and their disposition (e.g. "committed to building if nothing exists"). This seeds the opening message. */
  goal: string;
  /** Hidden facts the simulated user reveals ONLY when the agent asks for them — never volunteered all at once. */
  facts: string[];
  /** What a correct outcome looks like, printed in the report and fed to the judge. */
  expectation: string;
  expectStage?: FunnelStage;
  expectRiskAtLeast?: "high";
  expectModality?: Modality;
};

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: "Reuse check → lean build (no A/B tool exists)",
    persona: "A growth analyst.",
    goal: "You want a way to track A/B experiment results. You're happy to use something that already exists if it fits.",
    facts: ["Your team runs a handful of experiments a month.", "You mainly need to see win/loss and significance in one place."],
    expectation:
      "There is NO A/B experiment tool in the catalogue, so the honest answer is to acknowledge the gap in one sentence (no hallucinated tool, no over-scoping in chat). Since it's only a handful of experiments a month for a small team, either a lean skill/brief or a recommend_kill (Claude can compute significance from pasted numbers) is acceptable — but NOT a heavyweight app and NOT a false 'nothing exists then immediately draft a full spec' contradiction.",
  },
  {
    id: 2,
    title: "MCP case",
    persona: "A support-ops engineer.",
    goal: "Your support agents keep needing supplier contract terms but there's no clean way for a tool to pull them. You're committed to building this if nothing already covers it.",
    facts: [
      "The callers are AI agents resolving tickets automatically — no human in the loop.",
      "Hundreds of suppliers, thousands of queries a day, across a few agent pipelines.",
      "The terms live in machine-readable PDFs plus some structured data.",
      "Legal and Procurement own the contracts and must sign off on which fields get exposed.",
    ],
    expectation:
      "True modality is an MCP server (machine-to-machine, high query volume, no UI). Sensitive Legal/Procurement-owned data → risk high. Should end in a brief.",
    expectStage: "brief",
    expectRiskAtLeast: "high",
    expectModality: "mcp",
  },
  {
    id: 3,
    title: "Skill case",
    persona: "A content marketer.",
    goal: "Every week you write SEO briefs for new experience pages and it eats half a day. You'd build something if nothing covers it, but you'll try an existing tool first if it looks close.",
    facts: [
      "It's just you and two others doing this.",
      "The format and research steps are the same every time.",
      "The output is a doc you paste into the CMS.",
    ],
    expectation:
      "If the catalogue's SEO Brief Builder covers it, reuse is the right call; otherwise the true modality is a reusable Claude skill (text-in, doc-out, no UI, no hosting).",
    expectModality: "skill",
  },
  {
    id: 4,
    title: "Zep case",
    persona: "A revenue-team lead.",
    goal: "You want your daily bookings numbers to auto-post to a Slack channel every morning. Committed to building it if nothing exists.",
    facts: [
      "It's just a scheduled summary — no interaction needed.",
      "The whole revenue team reads it, every morning.",
      "The numbers come from your internal bookings database.",
    ],
    expectation:
      "True modality is a Zep on Headout's Zeps platform (connector orchestration + a cron trigger, no custom UI). Should end in a brief.",
    expectStage: "brief",
    expectModality: "zep",
  },
  {
    id: 5,
    title: "No-build / Claude-native (should kill)",
    persona: "A CX researcher.",
    goal: "You need to summarize this quarter's NPS verbatim comments into themes. You're open to being told you don't need to build anything.",
    facts: ["It's a one-time analysis for the quarterly review.", "It's really just you doing it."],
    expectation: "One-off, Claude-native task — should recommend_kill, not draft a brief.",
    expectStage: "kill",
  },
  {
    id: 6,
    title: "One-off script (should kill/redirect)",
    persona: "A digital-asset manager.",
    goal: "You need to bulk-rename 500 image files in your asset bucket. Open to being told the simplest way.",
    facts: ["It's one time, just this migration.", "You won't need to do it again."],
    expectation: "One-off migration task — should recommend_kill, not draft a brief.",
    expectStage: "kill",
  },
  {
    id: 7,
    title: "Full app (known-good)",
    persona: "An HR-ops manager.",
    goal: "HR wants to upload a sheet of role requirements and get back candidate profiles with emails. Committed to building it if nothing exists.",
    facts: [
      "The users are HR recruiters — 3 or 4 of them — a few times a week.",
      "A human reviews before any email is sent.",
      "It's internal HR only.",
      "The candidate profiles live in your internal ATS (Greenhouse).",
    ],
    expectation:
      "Genuine repeated multi-user need with a real review UI Zeps can't cleanly serve — should draft a brief, modality full_app (or micro_app if justified).",
    expectStage: "brief",
    expectModality: "full_app",
  },
  {
    id: 8,
    title: "Too big / eng-team",
    persona: "A pricing PM.",
    goal: "You want a system that dynamically reprices every experience based on live demand. Committed to pushing it forward.",
    facts: [
      "It would touch every experience and feed the live pricing engine.",
      "The Pricing and Data Science teams would need to own it.",
    ],
    expectation:
      "Should escalate_to_eng (modality eng_project) with a project pitch — NOT a self-serve repo, which would be a taxonomy contradiction.",
    expectStage: "escalate",
    expectModality: "eng_project",
  },
  {
    id: 9,
    title: "Vague intent",
    persona: "An ops associate.",
    goal: "You want to build something new but you open vaguely, without describing it. When asked, you clarify: a tool that helps ops track supplier response times.",
    facts: ["The ops team would use it, daily.", "You want to see which suppliers are slow to respond."],
    expectation:
      "First message is too vague to search on — should get one clarifying question, then proceed once the idea is described.",
  },
  {
    id: 10,
    title: "Registration",
    persona: "An engineer who just shipped something.",
    goal: "You built a refund classifier and want to list it in the catalogue.",
    facts: ["You have a URL to it ready if asked."],
    expectation: "Immediate start_registration, stage register, no search first.",
    expectStage: "register",
  },
  {
    id: 11,
    title: "Browse",
    persona: "A platform engineer.",
    goal: "You want to see all the MCPs the company has.",
    facts: [],
    expectation: "browse_catalogue with a type filter, not a scoping conversation.",
    expectStage: "chat",
  },
  {
    id: 12,
    title: "Off-mission",
    persona: "A bored employee.",
    goal: "You ask the assistant to write you a poem about Headout.",
    facts: [],
    expectation: "Politely declines / redirects — not a catalogue or build task at all.",
    expectStage: "chat",
  },
];

// ─── Simulated user ───────────────────────────────────────────────────────────

function simulatedUserSystemPrompt(scenario: Scenario): string {
  const factLines =
    scenario.facts.length > 0
      ? scenario.facts.map((f) => `  • ${f}`).join("\n")
      : "  (none — you have no extra details to give)";
  return `You are role-playing a Headout employee chatting with an internal-tools assistant. Stay fully in character — you are the USER, not the assistant.

WHO YOU ARE: ${scenario.persona}

WHAT YOU WANT: ${scenario.goal}

FACTS YOU KNOW (reveal these ONLY when the assistant asks something that calls for them — never dump them all at once, answer one question at a time like a real person):
${factLines}

HOW TO BEHAVE:
- Write like a real Slack message: one or two short sentences, casual, no lists.
- Answer the assistant's actual question. If it asks something your facts don't cover, give a brief natural answer or say you're not sure.
- Do NOT volunteer everything upfront. Let the assistant do its job of asking.
- If the assistant recommends an existing tool that genuinely fits your goal, accept it and wrap up.
- If the assistant says nothing exists and your goal is to build, tell it plainly you want to build it / let's scope it.
- If the assistant tells you that you don't need to build anything and gives a sensible alternative that fits, accept it.
- When the conversation has reached its natural end (you got an answer, a recommendation, a brief, a kill verdict, or a clear decline), reply with exactly: END
- Never break character. Never describe yourself as an AI. Never speak for the assistant.`;
}

/**
 * Produce the simulated user's next message given the transcript so far.
 * Roles are swapped: the storefront assistant's turns are "user" to this model,
 * and the simulated user's own prior turns are "assistant".
 */
async function simulateUserTurn(
  scenario: Scenario,
  transcript: ChatTurn[],
): Promise<string> {
  const messages: Anthropic.MessageParam[] =
    transcript.length === 0
      ? [{ role: "user", content: "Start the conversation with your opening message to the assistant." }]
      : transcript.map((t) => ({
          role: t.role === "assistant" ? "user" : "assistant",
          content: t.content,
        }));

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    temperature: 0,
    system: simulatedUserSystemPrompt(scenario),
    messages,
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  return text.trim();
}

// ─── Client-transport simulation ───────────────────────────────────────────────
// Mirrors HomeChat.tsx's fork-chip contract against the CURRENT server: the chip
// only sends mode:"scope" + searchContext after a no-match turn, and once stage
// "scope" is observed the client keeps mode:"scope" until brief/kill/scope_exit.
// (Phase 2 unifies the agent and removes this threading — at which point this
// helper collapses to "just send the message"; update it then.)

type ClientState = { inScope: boolean; lastQuery: string; lastResult: ChatResult | null };

function buildUserContext(
  scenario: Scenario,
  userText: string,
  state: ClientState,
): ChatUserContext {
  if (state.inScope) return { conversationId: `eval-${scenario.id}`, mode: "scope" };

  // Mirror HomeChat.tsx's scope entry. The dominant path is "continuing after a
  // gap": once the concierge has said nothing in the catalogue fits, the next
  // user message enters scope automatically (the client's continuingAfterGap /
  // fork-chip behavior) — regardless of how the user phrases their reply. We
  // also enter scope on an explicit build-affirm when there's prior context.
  // We deliberately do NOT trigger on isMatchRejection/isBuildIntent here: a
  // satisfied "nah, that's exactly what I needed" starts with "nah" and would
  // false-positive, wrongly dragging a happy browse/reuse turn into scoping.
  const priorGap = state.lastResult ? isGapAcknowledgement(state.lastResult.message) : false;
  const priorTools = state.lastResult?.tools ?? [];
  const hasPriorContext = (state.lastResult?.noMatch ?? false) || priorTools.length > 0;
  if (priorGap || (isScopeAffirm(userText) && hasPriorContext)) {
    return {
      conversationId: `eval-${scenario.id}`,
      mode: "scope",
      searchContext: {
        query: (state.lastQuery || userText).slice(0, 120),
        nearMisses: priorTools.map((t) => ({ name: t.name, oneLiner: t.oneLiner })),
      },
    };
  }
  return { conversationId: `eval-${scenario.id}` };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

type TurnLog = { role: "user" | "assistant"; text: string; stage?: FunnelStage; toolSignal?: string };

type TerminalOutcome = { stage: "brief" | "kill" | "escalate"; turnIndex: number; result: ChatResult };

type Rubric = {
  coherence: number;
  contextRetention: number;
  noContradiction: number;
  pushbackQuality: number;
  gapNoteHonesty: number;
  concision: number;
  summary: string;
};

type ScenarioReport = {
  scenario: Scenario;
  turns: TurnLog[];
  finalResult: ChatResult | null;
  terminalOutcome: TerminalOutcome | null;
  error: string | null;
  scopeQuestionCount: number;
  modalityHits: string[];
  rubric: Rubric | null;
};

const MODALITY_TERMS = ["MCP", "skill", "Zep", "engineering team", "platform team"];

function inferToolSignal(result: ChatResult, prevStage: FunnelStage | undefined): string {
  if (result.registration) return "start_registration";
  if (result.stage === "brief") return "draft_brief";
  if (result.stage === "kill") return "recommend_kill";
  if (result.stage === "escalate") return "escalate_to_eng";
  if (result.stage === "scope_exit") return "end_scope";
  if (result.stage === "scope") {
    return prevStage === "scope"
      ? "(critique agent question — no tool call this turn)"
      : "search_catalogue → handoff to critique agent (no strong match)";
  }
  if (result.stage === "chat") {
    if (result.tools && result.tools.length > 0) return "search_catalogue / browse_catalogue (match found)";
    if (result.noMatch) return "search_catalogue (no match)";
    return "(no tool — plain chat)";
  }
  return "(unknown)";
}

async function runScenario(scenario: Scenario): Promise<ScenarioReport> {
  const history: ChatTurn[] = [];
  const turns: TurnLog[] = [];
  const state: ClientState = { inScope: false, lastQuery: "", lastResult: null };
  let finalResult: ChatResult | null = null;
  let terminalOutcome: TerminalOutcome | null = null;
  let error: string | null = null;

  for (let i = 0; i < MAX_EXCHANGES; i++) {
    let userText: string;
    try {
      userText = await simulateUserTurn(scenario, history);
    } catch (err) {
      error = `simulated-user error: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
    if (!userText || userText.trim().toUpperCase() === "END") break;

    history.push({ role: "user", content: userText });
    turns.push({ role: "user", text: userText });

    const prevStage = finalResult?.stage;
    const userCtx = buildUserContext(scenario, userText, state);

    let result: ChatResult;
    try {
      result = await runChat(history, userCtx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      turns.push({ role: "assistant", text: `[ERROR: ${error}]` });
      break;
    }

    history.push({ role: "assistant", content: result.message });
    turns.push({ role: "assistant", text: result.message, stage: result.stage, toolSignal: inferToolSignal(result, prevStage) });
    finalResult = result;

    // Advance the client-transport state machine.
    if (!state.inScope && userCtx.mode !== "scope") state.lastQuery = userText;
    state.lastResult = result;
    if (result.stage === "scope") state.inScope = true;
    if (result.stage === "brief" || result.stage === "kill" || result.stage === "scope_exit") state.inScope = false;

    if (
      terminalOutcome === null &&
      (result.stage === "brief" || result.stage === "kill" || result.stage === "escalate")
    ) {
      terminalOutcome = { stage: result.stage, turnIndex: i + 1, result };
      break; // terminal outcome reached — stop the conversation
    }
    if (result.stage === "register" || result.stage === "scope_exit") break;
  }

  const scopeQuestionCount = turns.filter(
    (t) => t.role === "assistant" && t.stage === "scope" && t.text.trim().endsWith("?"),
  ).length;

  const allAssistantText = turns
    .filter((t) => t.role === "assistant")
    .map((t) => t.text)
    .join(" \n ")
    .toLowerCase();
  const modalityHits = MODALITY_TERMS.filter((term) => allAssistantText.includes(term.toLowerCase()));

  let rubric: Rubric | null = null;
  if (!error && turns.length > 0) {
    try {
      rubric = await judgeTranscript(scenario, turns);
    } catch (err) {
      error = `judge error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return { scenario, turns, finalResult, terminalOutcome, error, scopeQuestionCount, modalityHits, rubric };
}

// ─── LLM judge ────────────────────────────────────────────────────────────────

const JUDGE_TOOL: Anthropic.Tool = {
  name: "submit_scores",
  description: "Submit the conversation-quality scores for the transcript.",
  input_schema: {
    type: "object",
    properties: {
      coherence: { type: "integer", description: "1–5. Do the assistant's replies read naturally and hang together as one conversation?" },
      contextRetention: { type: "integer", description: "1–5. Did the assistant use facts the user already gave, without re-asking or forgetting them?" },
      noContradiction: { type: "integer", description: "1–5. Did the assistant avoid contradicting itself across turns (e.g. flip-flopping 'nothing exists' ↔ 'X already does this')? 5 = no contradictions." },
      pushbackQuality: { type: "integer", description: "1–5. When scoping/critiquing, was the pushback sharp, relevant, and well-reasoned (vs generic form-filling or none)? Score 3 if the scenario needed no pushback." },
      gapNoteHonesty: { type: "integer", description: "1–5. Were claims about what tools do / don't cover truthful and non-hallucinated (no invented tools or capabilities)? 5 = fully honest." },
      concision: { type: "integer", description: "1–5. Was it appropriately brief — no repetition, no dumping metadata the UI already shows?" },
      summary: { type: "string", description: "One or two sentences: the single biggest conversation-quality problem in this transcript, or 'clean' if none." },
    },
    required: ["coherence", "contextRetention", "noContradiction", "pushbackQuality", "gapNoteHonesty", "concision", "summary"],
  },
};

function transcriptForJudge(turns: TurnLog[]): string {
  return turns
    .map((t) => (t.role === "user" ? `USER: ${t.text}` : `ASSISTANT: ${t.text}`))
    .join("\n\n");
}

async function judgeTranscript(scenario: Scenario, turns: TurnLog[]): Promise<Rubric> {
  const system = `You are a strict evaluator of an internal-tools assistant's conversation quality. You are NOT grading whether it reached a particular stage (that's checked separately) — you are grading the CONVERSATION as a user would experience it.

Score each dimension 1 (poor) to 5 (excellent) using the submit_scores tool. Be critical: reserve 5 for genuinely excellent, use 1–2 for real failures. A self-contradiction across turns, a re-asked question, or a hallucinated tool should tank the relevant score.

For context, here is what a correct outcome for this scenario looks like (do not grade on stage, only use this to judge whether the assistant's reasoning/pushback was on-target): ${scenario.expectation}`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system,
    tools: [JUDGE_TOOL],
    tool_choice: { type: "tool", name: "submit_scores" },
    messages: [{ role: "user", content: `Transcript:\n\n${transcriptForJudge(turns)}` }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const a = (toolUse?.input ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    coherence: num(a.coherence),
    contextRetention: num(a.contextRetention),
    noContradiction: num(a.noContradiction),
    pushbackQuality: num(a.pushbackQuality),
    gapNoteHonesty: num(a.gapNoteHonesty),
    concision: num(a.concision),
    summary: typeof a.summary === "string" ? a.summary : "",
  };
}

// ─── Report rendering ────────────────────────────────────────────────────────

function emptyBriefFields(brief: BriefPayload | null | undefined): string[] {
  if (!brief) return [];
  const empties: string[] = [];
  if (!brief.title?.trim()) empties.push("title");
  if (!brief.problem?.trim()) empties.push("problem");
  if (!brief.users?.trim()) empties.push("users");
  if (!brief.frequency?.trim()) empties.push("frequency");
  if (!brief.mustDo || brief.mustDo.length === 0) empties.push("mustDo");
  if (!brief.wontDo || brief.wontDo.length === 0) empties.push("wontDo");
  if (!brief.modalityReason?.trim()) empties.push("modalityReason");
  return empties;
}

function renderBriefPayload(brief: BriefPayload): string {
  return [
    `- **title**: ${brief.title ?? "_(none)_"}`,
    `- **problem**: ${brief.problem || "_(empty)_"}`,
    `- **users**: ${brief.users || "_(empty)_"}`,
    `- **frequency**: ${brief.frequency || "_(empty)_"}`,
    `- **mustDo**: ${brief.mustDo.length > 0 ? brief.mustDo.map((m) => `\n  - ${m}`).join("") : "_(empty)_"}`,
    `- **wontDo**: ${brief.wontDo.length > 0 ? brief.wontDo.map((m) => `\n  - ${m}`).join("") : "_(empty)_"}`,
    `- **modality**: ${brief.modality}`,
    `- **modalityReason**: ${brief.modalityReason || "_(empty)_"}`,
    `- **risk**: ${brief.risk}`,
  ].join("\n");
}

function renderKillPayload(kill: KillPayload): string {
  return [
    `- **modality**: ${kill.modality}`,
    `- **reason**: ${kill.reason || "_(empty)_"}`,
    `- **alternative**: ${kill.alternative || "_(empty)_"}`,
    `- **alternativeUrl**: ${kill.alternativeUrl ?? "_(none)_"}`,
  ].join("\n");
}

function renderEscalatePayload(escalate: EscalatePayload): string {
  return [
    `- **modality**: ${escalate.modality}`,
    `- **problem**: ${escalate.problem || "_(empty)_"}`,
    `- **whyLoadBearing**: ${escalate.whyLoadBearing || "_(empty)_"}`,
    `- **suggestedOwningTeams**: ${escalate.suggestedOwningTeams || "_(empty)_"}`,
    `- **roughShape**: ${escalate.roughShape || "_(empty)_"}`,
  ].join("\n");
}

function outcomeModality(result: ChatResult | null): Modality | null {
  return (
    result?.briefPayload?.modality ??
    result?.killPayload?.modality ??
    result?.escalatePayload?.modality ??
    null
  );
}

function computeFlags(report: ScenarioReport): string[] {
  const flags: string[] = [];
  const { scenario, terminalOutcome, scopeQuestionCount, rubric } = report;
  const outcomeStage = terminalOutcome?.stage;
  const outcomeResult = terminalOutcome?.result ?? null;

  if (scenario.expectStage && (outcomeStage ?? report.finalResult?.stage) !== scenario.expectStage) {
    flags.push(
      `⚠️ expected outcome \`${scenario.expectStage}\`, got \`${outcomeStage ?? report.finalResult?.stage ?? "(none)"}\``,
    );
  }
  if (outcomeStage === "brief" && outcomeResult?.briefPayload) {
    const empties = emptyBriefFields(outcomeResult.briefPayload);
    if (empties.length > 0) flags.push(`⚠️ brief has empty required field(s): ${empties.join(", ")}`);
  }
  const modality = outcomeModality(outcomeResult);
  if (scenario.expectModality && modality !== scenario.expectModality) {
    flags.push(`⚠️ expected modality \`${scenario.expectModality}\`, got \`${modality ?? "(none)"}\``);
  }
  if (scenario.expectRiskAtLeast === "high" && outcomeStage === "brief") {
    const risk = outcomeResult?.briefPayload?.risk;
    if (risk !== "high") flags.push(`⚠️ expected risk \`high\`, got \`${risk ?? "(none)"}\``);
  }
  if (scopeQuestionCount > 6) {
    flags.push(`⚠️ over-questioning: ${scopeQuestionCount} scope questions (cap is ~6)`);
  }
  // Conversation-quality flags from the judge.
  if (rubric) {
    const lows: string[] = [];
    if (rubric.noContradiction <= 2) lows.push(`self-contradiction (${rubric.noContradiction}/5)`);
    if (rubric.contextRetention <= 2) lows.push(`context loss (${rubric.contextRetention}/5)`);
    if (rubric.coherence <= 2) lows.push(`incoherent (${rubric.coherence}/5)`);
    if (rubric.gapNoteHonesty <= 2) lows.push(`dishonest gap notes (${rubric.gapNoteHonesty}/5)`);
    if (rubric.pushbackQuality <= 2) lows.push(`weak pushback (${rubric.pushbackQuality}/5)`);
    if (rubric.concision <= 2) lows.push(`verbose/repetitive (${rubric.concision}/5)`);
    if (lows.length > 0) flags.push(`⚠️ conversation-quality: ${lows.join(", ")}`);
  }
  return flags;
}

function rubricAvg(r: Rubric | null): string {
  if (!r) return "—";
  const vals = [r.coherence, r.contextRetention, r.noContradiction, r.pushbackQuality, r.gapNoteHonesty, r.concision];
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function renderScenarioSection(report: ScenarioReport): string {
  const { scenario, turns, terminalOutcome, error, rubric } = report;
  const flags = computeFlags(report);
  const outcomeResult = terminalOutcome?.result ?? null;
  const lines: string[] = [];

  lines.push(`## ${scenario.id}. ${scenario.title}`);
  lines.push("");
  lines.push(`**Expectation:** ${scenario.expectation}`);
  lines.push("");
  lines.push(
    `**Terminal outcome:** ${terminalOutcome ? `\`${terminalOutcome.stage}\` at exchange ${terminalOutcome.turnIndex}` : `\`${report.finalResult?.stage ?? "(none)"}\``}`,
  );
  lines.push(`**Scope questions asked:** ${report.scopeQuestionCount}`);
  lines.push(`**Modality terms named:** ${report.modalityHits.length > 0 ? report.modalityHits.join(", ") : "(none)"}`);
  if (rubric) {
    lines.push(
      `**Conversation rubric (avg ${rubricAvg(rubric)}/5):** coherence ${rubric.coherence}, context ${rubric.contextRetention}, no-contradiction ${rubric.noContradiction}, pushback ${rubric.pushbackQuality}, honesty ${rubric.gapNoteHonesty}, concision ${rubric.concision}`,
    );
    lines.push(`**Judge note:** ${rubric.summary}`);
  }
  if (error) lines.push(`**Error:** ${error}`);
  lines.push("");

  if (flags.length > 0) {
    lines.push("**Flags:**");
    for (const f of flags) lines.push(`- ${f}`);
    lines.push("");
  }

  lines.push("<details><summary>Transcript</summary>");
  lines.push("");
  for (const turn of turns) {
    if (turn.role === "user") lines.push(`**User:** ${turn.text}`);
    else {
      lines.push(`**Assistant** (stage: \`${turn.stage ?? "?"}\`, tool signal: ${turn.toolSignal ?? "?"}):`);
      lines.push(`> ${turn.text.replace(/\n/g, "\n> ")}`);
    }
    lines.push("");
  }
  lines.push("</details>");
  lines.push("");

  if (outcomeResult?.briefPayload) {
    lines.push("**Raw briefPayload:**", "", renderBriefPayload(outcomeResult.briefPayload), "");
  }
  if (outcomeResult?.killPayload) {
    lines.push("**Raw killPayload:**", "", renderKillPayload(outcomeResult.killPayload), "");
  }
  if (outcomeResult?.escalatePayload) {
    lines.push("**Raw escalatePayload:**", "", renderEscalatePayload(outcomeResult.escalatePayload), "");
  }
  return lines.join("\n");
}

function renderSummaryTable(reports: ScenarioReport[]): string {
  const header = "| # | Scenario | outcome | modality | risk | # q | rubric avg | biggest problem |";
  const sep = "|---|---|---|---|---|---|---|---|";
  const rows = reports.map((r) => {
    const outcomeResult = r.terminalOutcome?.result ?? null;
    const brief = outcomeResult?.briefPayload;
    const modality = outcomeModality(outcomeResult);
    const outcome = r.terminalOutcome ? `\`${r.terminalOutcome.stage}\`` : `\`${r.finalResult?.stage ?? "(none)"}\``;
    const problem = r.rubric ? r.rubric.summary.slice(0, 60) : "—";
    return `| ${r.scenario.id} | ${r.scenario.title} | ${outcome} | ${modality ?? "—"} | ${brief?.risk ?? "—"} | ${r.scopeQuestionCount} | ${rubricAvg(r.rubric)} | ${problem} |`;
  });
  return [header, sep, ...rows].join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding catalogue (if empty)...");
  await seedCatalogueIfEmpty();

  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    console.log(`Running scenario ${scenario.id}: ${scenario.title}...`);
    reports.push(await runScenario(scenario));
  }

  const markdown = [
    "# E2E conversation eval report",
    "",
    "Generated by `tsx src/eval/e2eConversations.ts` — simulated-user + LLM-judge. Measurement only.",
    "",
    "## Summary",
    "",
    renderSummaryTable(reports),
    "",
    ...reports.map(renderScenarioSection),
  ].join("\n");

  writeFileSync(REPORT_PATH, markdown, "utf-8");
  console.log(`\nReport written to ${REPORT_PATH}`);
}

await main();

/**
 * E2E conversation eval harness.
 *
 * Runs a fixed set of scripted, multi-turn conversations through the real
 * `runChat` pipeline (the same function `routes/chat.ts` calls) and writes a
 * structured markdown report. This replaces manually paste-testing one turn
 * at a time — fixes should come from reading this report, not from guessing
 * turn-by-turn.
 *
 * This is a MEASUREMENT tool only. It does not fix anything it finds.
 *
 * Read-only against the catalogue: `runChat`'s registration path
 * (start_registration) only ever sets `result.registration` — the actual
 * `insertTool` call lives in a separate route triggered by the client after
 * the user confirms the draft (BriefCard/handleAddConfirm), which this
 * harness never calls. flag_tool / request_access / update_tool are the only
 * other mutating tools `runChat` exposes, and no scripted message below
 * triggers them. search_catalogue / browse_catalogue / get_tool_details are
 * read-only. embed() and the Anthropic calls still hit the real network.
 *
 * Run with (Replit only — needs DATABASE_URL + the Anthropic integration):
 *   tsx src/eval/e2eConversations.ts
 *
 * Do NOT add this to the `test` script glob (src/eval/*.test.ts) — it's a
 * manual report generator, not a pass/fail regression test.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// ─── Scenario definitions ───────────────────────────────────────────────────

/** The literal scope-trigger message used by every scenario below that forks into scoping. */
const SCOPE_TRIGGER_TEXT = "Let's scope the idea — I want to build it";

type Scenario = {
  id: number;
  title: string;
  /** Fixed ordered user messages. The agent's questions vary — we send this
   *  sequence regardless of what it asks and capture whatever outcome results. */
  messages: string[];
  /** What a correct outcome looks like, for the report header — not enforced,
   *  just printed alongside the actual result so a human can compare. */
  expectation: string;
  /** If set, flag in the report when the terminal outcome's stage doesn't match. */
  expectStage?: FunnelStage;
  /** If set, flag when the drafted brief's risk is below this. */
  expectRiskAtLeast?: "high";
  /** If set, flag when the outcome's modality doesn't match — the real,
   *  post-Phase-3 check (this used to only be checkable by eye against a
   *  flattened micro/full appClass; now it's a direct field comparison). */
  expectModality?: Modality;
  /**
   * How the scenario's SCOPE_TRIGGER_TEXT turn is sent. Defaults to "scope"
   * — the real UI's fork chip only appears on a no-match turn and sends
   * `mode: "scope"` + searchContext, so that's what most scenarios should
   * measure. Exactly one scenario should be "typed" (see its definition
   * below): when the first turn already returns a strong match, the fork
   * chip never renders in the real UI at all — the only way to reach
   * scoping is typing intent as plain text, so that scenario deliberately
   * exercises the typed-intent-detection path instead of the flag.
   */
  scopeTriggerMode?: "typed" | "scope";
};

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: "Reuse (should find existing)",
    messages: ["Something to track A/B experiment results"],
    expectation: "Finds an existing catalogue tool, no handoff to scope.",
    expectStage: "chat",
  },
  {
    id: 2,
    title: "MCP case",
    messages: [
      "Our support agents keep needing supplier contract terms but there's no clean way for a tool to pull them",
      "Let's scope the idea — I want to build it",
      "They're AI agents resolving tickets automatically, no human in the loop, hundreds of suppliers queried constantly",
      "Mostly machine-readable PDFs and structured data",
      "A few agent pipelines but thousands of queries a day",
      "Both structured fields and raw clause text",
      "Legal and Procurement own them and must sign off on exposed fields",
    ],
    expectation:
      "True modality is an MCP server (machine-to-machine, high query volume, no UI). Exposes sensitive Legal/Procurement-owned data → risk should be high.",
    expectStage: "brief",
    expectRiskAtLeast: "high",
    expectModality: "mcp",
  },
  {
    id: 3,
    title: "Skill case (typed-intent path — first turn finds a strong match, so the fork chip never renders; scope trigger is sent as plain text)",
    messages: [
      "Every week I write SEO briefs for new experience pages and it eats half a day",
      "Let's scope the idea — I want to build it",
      "It's just me and two others, but the format and research steps are the same every time",
      "Output is a doc we paste into the CMS",
    ],
    expectation:
      "True modality is a reusable Claude skill (text-in, doc-out, no UI, no hosting).",
    expectStage: "brief",
    expectModality: "skill",
    scopeTriggerMode: "typed",
  },
  {
    id: 4,
    title: "Zep case",
    messages: [
      "I want our daily bookings numbers to auto-post to a Slack channel every morning",
      "Let's scope the idea — I want to build it",
      "Just a scheduled summary, no interaction needed",
      "Whole revenue team reads it, every morning",
    ],
    expectation:
      "True modality is a Zep on Headout's Zeps platform (connector orchestration + a cron trigger, no custom UI).",
    expectStage: "brief",
    expectModality: "zep",
  },
  {
    id: 5,
    title: "No-build / Claude-native (should kill)",
    messages: [
      "I need to summarize this quarter's NPS verbatim comments into themes",
      "Let's scope the idea — I want to build it",
      "It's a one-time analysis for the quarterly review",
    ],
    expectation: "One-off, Claude-native task — should recommend_kill, not draft a brief.",
    expectStage: "kill",
  },
  {
    id: 6,
    title: "One-off script (should kill/redirect)",
    messages: [
      "I need to bulk-rename 500 image files in our asset bucket",
      "Let's scope the idea — I want to build it",
      "One time, just this migration",
    ],
    expectation: "One-off migration task — should recommend_kill, not draft a brief.",
    expectStage: "kill",
  },
  {
    id: 7,
    title: "Full app (known-good)",
    messages: [
      "HR wants to upload a sheet of role requirements and get back candidate profiles with emails",
      "Let's scope the idea — I want to build it",
      "HR recruiters, 3-4 of them, a few times a week",
      "A human reviews before any email is sent",
      "Internal HR only",
    ],
    expectation: "Genuine repeated multi-user need — should draft a brief, modality full_app.",
    expectStage: "brief",
    expectModality: "full_app",
  },
  {
    id: 8,
    title: "Too big / eng-team",
    messages: [
      "I want a system that dynamically reprices every experience based on live demand",
      "Let's scope the idea — I want to build it",
      "It would touch every experience and feed the live pricing engine",
      "Pricing and data science teams",
    ],
    expectation:
      "Should escalate_to_eng (modality eng_project) with a project pitch — NOT end in draft_brief with a self-serve repo, which would be a taxonomy contradiction.",
    expectStage: "escalate",
    expectModality: "eng_project",
  },
  {
    id: 9,
    title: "Vague intent",
    messages: [
      "I want to build something new",
      "A tool that helps ops track supplier response times",
      "Ops team, daily",
    ],
    expectation:
      "First message is too vague to search on — should get the deterministic clarifier, then proceed once the idea is described.",
  },
  {
    id: 10,
    title: "Registration",
    messages: ["I built a refund classifier and want to list it"],
    expectation: "Immediate start_registration, stage register, no search first.",
    expectStage: "register",
  },
  {
    id: 11,
    title: "Browse",
    messages: ["Show me all the MCPs we have"],
    expectation: "browse_catalogue with type filter, not search_catalogue.",
    expectStage: "chat",
  },
  {
    id: 12,
    title: "Off-mission",
    messages: ["Write me a poem about Headout"],
    expectation: "Politely declines / redirects — not a catalogue or build task at all.",
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

type TurnLog = {
  role: "user" | "assistant";
  text: string;
  stage?: FunnelStage;
  /** Best-effort inference of which tool produced this turn, since ChatResult
   *  doesn't expose a tool-call trace. Not a ground-truth call log — derived
   *  from stage transitions and result shape. */
  toolSignal?: string;
};

/** The first draft_brief/recommend_kill/escalate_to_eng ever reached in a conversation — the honest outcome, regardless of what came after. */
type TerminalOutcome = {
  stage: "brief" | "kill" | "escalate";
  /** 1-based index into scenario.messages of the user turn that produced this outcome. */
  turnIndex: number;
  result: ChatResult;
};

type ScenarioReport = {
  scenario: Scenario;
  turns: TurnLog[];
  /** The last turn's result — kept for transcript/debugging (e.g. did the concierge fall back after a brief), NOT for grading the outcome. */
  finalResult: ChatResult | null;
  /** The honest outcome: the first terminal stage ever reached, with its full payload. This is what scoring/flags should use. */
  terminalOutcome: TerminalOutcome | null;
  error: string | null;
  scopeQuestionCount: number;
  modalityHits: string[];
};

const MODALITY_TERMS = ["MCP", "skill", "Zep", "engineering team", "platform team"];

/** Best-effort label for what tool produced this turn's result. See TurnLog.toolSignal. */
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
  let inScope = false;
  let prevUserText = "";
  let finalResult: ChatResult | null = null;
  let terminalOutcome: TerminalOutcome | null = null;
  let error: string | null = null;

  for (let i = 0; i < scenario.messages.length; i++) {
    const userText = scenario.messages[i];
    history.push({ role: "user", content: userText });
    turns.push({ role: "user", text: userText });

    const prevStage = finalResult?.stage;

    // Mirror the real UI's fork chip: it only renders (and only sends
    // mode:"scope" + searchContext) when the previous turn came back with
    // no catalogue match at all. See Scenario.scopeTriggerMode.
    const isScopeTrigger = userText === SCOPE_TRIGGER_TEXT;
    const sendScopeMode =
      !inScope && isScopeTrigger && (scenario.scopeTriggerMode ?? "scope") === "scope";

    const userCtx: ChatUserContext = {
      conversationId: `eval-scenario-${scenario.id}`,
      ...(inScope
        ? { mode: "scope" as const }
        : sendScopeMode
          ? {
              mode: "scope" as const,
              searchContext: {
                query: (prevUserText || userText).slice(0, 120),
                nearMisses: (finalResult?.tools ?? []).map((t) => ({
                  name: t.name,
                  oneLiner: t.oneLiner,
                })),
              },
            }
          : {}),
    };

    let result: ChatResult;
    try {
      result = await runChat(history, userCtx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      turns.push({ role: "assistant", text: `[ERROR: ${error}]` });
      break;
    }

    history.push({ role: "assistant", content: result.message });
    turns.push({
      role: "assistant",
      text: result.message,
      stage: result.stage,
      toolSignal: inferToolSignal(result, prevStage),
    });
    finalResult = result;
    prevUserText = userText;

    if (
      terminalOutcome === null &&
      (result.stage === "brief" || result.stage === "kill" || result.stage === "escalate")
    ) {
      terminalOutcome = { stage: result.stage, turnIndex: i + 1, result };
    }

    // Mirror HomeChat.tsx's inScopeMode threading exactly: once the client
    // observes stage "scope" it keeps passing mode:"scope" on every
    // subsequent turn (with no searchContext — the server falls back to
    // extractSearchContext(history)), until brief/kill/scope_exit resolves it.
    if (result.stage === "scope") inScope = true;
    if (result.stage === "brief" || result.stage === "kill" || result.stage === "scope_exit") {
      inScope = false;
    }
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

  return { scenario, turns, finalResult, terminalOutcome, error, scopeQuestionCount, modalityHits };
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
  const lines = [
    `- **title**: ${brief.title ?? "_(none)_"}`,
    `- **problem**: ${brief.problem || "_(empty)_"}`,
    `- **users**: ${brief.users || "_(empty)_"}`,
    `- **frequency**: ${brief.frequency || "_(empty)_"}`,
    `- **mustDo**: ${brief.mustDo.length > 0 ? brief.mustDo.map((m) => `\n  - ${m}`).join("") : "_(empty)_"}`,
    `- **wontDo**: ${brief.wontDo.length > 0 ? brief.wontDo.map((m) => `\n  - ${m}`).join("") : "_(empty)_"}`,
    `- **modality**: ${brief.modality}`,
    `- **modalityReason**: ${brief.modalityReason || "_(empty)_"}`,
    `- **risk**: ${brief.risk}`,
    `- **searchContext.query**: ${brief.searchContext?.query || "_(empty)_"}`,
    `- **searchContext.nearMisses**: ${
      brief.searchContext?.nearMisses.length
        ? brief.searchContext.nearMisses.map((n) => `\n  - ${n.name}: ${n.oneLiner}`).join("")
        : "_(none)_"
    }`,
  ];
  return lines.join("\n");
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

/** The outcome's modality regardless of which of the three outcome payloads carries it. */
function outcomeModality(result: ChatResult | null): Modality | null {
  return (
    result?.briefPayload?.modality ??
    result?.killPayload?.modality ??
    result?.escalatePayload?.modality ??
    null
  );
}

/** Automated flags per "What the report should make obvious" — computed generically from scenario metadata, not hardcoded per id. Graded against the honest terminal outcome, not the last scripted turn. */
function computeFlags(report: ScenarioReport): string[] {
  const flags: string[] = [];
  const { scenario, terminalOutcome, finalResult, scopeQuestionCount } = report;
  const outcomeStage = terminalOutcome?.stage;
  const outcomeResult = terminalOutcome?.result ?? null;

  if (scenario.expectStage && outcomeStage !== scenario.expectStage) {
    flags.push(
      `⚠️ expected terminal outcome \`${scenario.expectStage}\`, got \`${outcomeStage ?? "(none reached — conversation never resolved)"}\``,
    );
  }

  if (outcomeStage === "brief" && outcomeResult?.briefPayload) {
    const empties = emptyBriefFields(outcomeResult.briefPayload);
    if (empties.length > 0) {
      flags.push(`⚠️ brief has empty required field(s): ${empties.join(", ")}`);
    }
  }

  const modality = outcomeModality(outcomeResult);
  if (scenario.expectModality && modality !== scenario.expectModality) {
    flags.push(
      `⚠️ expected modality \`${scenario.expectModality}\`, got \`${modality ?? "(none)"}\``,
    );
  }

  if (scenario.expectRiskAtLeast === "high" && outcomeStage === "brief") {
    const risk = outcomeResult?.briefPayload?.risk;
    if (risk !== "high") {
      flags.push(`⚠️ expected risk \`high\` (sensitive data / access sign-off involved), got \`${risk ?? "(none)"}\``);
    }
  }

  if (scopeQuestionCount > 6) {
    flags.push(`⚠️ over-questioning: ${scopeQuestionCount} scope questions asked (cap is meant to be ~6)`);
  }

  if (
    outcomeStage === "brief" &&
    report.modalityHits.some((h) => h.toLowerCase() === "engineering team")
  ) {
    flags.push(
      `⚠️ outcome-taxonomy contradiction: assistant text names "engineering team" but still ended in draft_brief (a self-serve repo) — should have escalated instead`,
    );
  }

  // Turns scripted after the terminal outcome exist deliberately in some
  // scenarios (to probe post-outcome behavior, e.g. bug C) — this isn't
  // itself wrong, but a fall-back to plain concierge `chat` afterward is a
  // routing regression worth surfacing on stage/routing grounds alone.
  if (
    terminalOutcome &&
    terminalOutcome.turnIndex < scenario.messages.length &&
    finalResult?.stage === "chat"
  ) {
    flags.push(
      `⚠️ conversation fell back to concierge \`chat\` stage after reaching \`${terminalOutcome.stage}\` at turn ${terminalOutcome.turnIndex} — check post-outcome turns for a re-routing regression`,
    );
  }

  return flags;
}

function renderScenarioSection(report: ScenarioReport): string {
  const { scenario, turns, finalResult, terminalOutcome, error } = report;
  const flags = computeFlags(report);
  const outcomeResult = terminalOutcome?.result ?? null;

  const lines: string[] = [];
  lines.push(`## ${scenario.id}. ${scenario.title}`);
  lines.push("");
  lines.push(`**Expectation:** ${scenario.expectation}`);
  lines.push("");
  lines.push(
    `**Terminal outcome:** ${
      terminalOutcome
        ? `\`${terminalOutcome.stage}\` at turn ${terminalOutcome.turnIndex} of ${scenario.messages.length}`
        : "(none reached)"
    }`,
  );
  lines.push(
    `**Final stage (last scripted turn):** \`${finalResult?.stage ?? "(none)"}\`${
      terminalOutcome && terminalOutcome.turnIndex < scenario.messages.length
        ? " _(conversation continued past the terminal outcome — see transcript)_"
        : ""
    }`,
  );
  lines.push(`**Scope questions asked:** ${report.scopeQuestionCount}`);
  lines.push(
    `**Modality terms named in assistant text:** ${
      report.modalityHits.length > 0 ? report.modalityHits.join(", ") : "(none)"
    }`,
  );
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
    if (turn.role === "user") {
      lines.push(`**User:** ${turn.text}`);
    } else {
      lines.push(
        `**Assistant** (stage: \`${turn.stage ?? "?"}\`, tool signal: ${turn.toolSignal ?? "?"}):`,
      );
      lines.push(`> ${turn.text.replace(/\n/g, "\n> ")}`);
    }
    lines.push("");
  }
  lines.push("</details>");
  lines.push("");

  if (outcomeResult?.briefPayload) {
    lines.push("**Raw briefPayload (from the terminal outcome):**");
    lines.push("");
    lines.push(renderBriefPayload(outcomeResult.briefPayload));
    lines.push("");
  }

  if (outcomeResult?.killPayload) {
    lines.push("**Raw killPayload (from the terminal outcome):**");
    lines.push("");
    lines.push(renderKillPayload(outcomeResult.killPayload));
    lines.push("");
  }

  if (outcomeResult?.escalatePayload) {
    lines.push("**Raw escalatePayload (from the terminal outcome):**");
    lines.push("");
    lines.push(renderEscalatePayload(outcomeResult.escalatePayload));
    lines.push("");
  }

  return lines.join("\n");
}

function renderSummaryTable(reports: ScenarioReport[]): string {
  const header =
    "| # | Scenario | terminal outcome | last-turn stage | modality (payload) | risk | # questions | brief empty? | modality named? |";
  const sep = "|---|---|---|---|---|---|---|---|---|";
  const rows = reports.map((r) => {
    const outcomeResult = r.terminalOutcome?.result ?? null;
    const brief = outcomeResult?.briefPayload;
    const emptyFields = emptyBriefFields(brief);
    const modality = outcomeModality(outcomeResult);
    return [
      r.scenario.id,
      r.scenario.title,
      r.terminalOutcome ? `\`${r.terminalOutcome.stage}\` @${r.terminalOutcome.turnIndex}` : "(none)",
      `\`${r.finalResult?.stage ?? "(none)"}\``,
      modality ?? "—",
      brief?.risk ?? "—",
      r.scopeQuestionCount,
      brief ? (emptyFields.length > 0 ? `⚠️ ${emptyFields.join(", ")}` : "no") : "—",
      r.modalityHits.length > 0 ? r.modalityHits.join(", ") : "no",
    ].join(" | ");
  });
  return [header, sep, ...rows.map((r) => `| ${r} |`)].join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding catalogue (if empty)...");
  await seedCatalogueIfEmpty();

  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    console.log(`Running scenario ${scenario.id}: ${scenario.title}...`);
    const report = await runScenario(scenario);
    reports.push(report);
  }

  const sections = [
    "# E2E conversation eval report",
    "",
    `Generated by \`tsx src/eval/e2eConversations.ts\`. Measurement only — no bugs fixed here.`,
    "",
    "## Summary",
    "",
    renderSummaryTable(reports),
    "",
    ...reports.map(renderScenarioSection),
  ];

  const markdown = sections.join("\n");
  writeFileSync(REPORT_PATH, markdown, "utf-8");
  console.log(`\nReport written to ${REPORT_PATH}`);
}

await main();

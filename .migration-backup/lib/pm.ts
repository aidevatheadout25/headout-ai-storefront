import {
  computeStakesLevel,
  buildIntakeHaystack,
  synthesizeIntakePlan,
} from "@/lib/funnel";
import type {
  BuildPath,
  BuildPathRecommendation,
  PmRecommendation,
  RequestPrerequisites,
  RequestValidation,
  StakesLevel,
  Tool,
  ToolType,
} from "@/lib/types";

const VAGUE_TERMS =
  /\b(something|better|tool|help|misc|stuff|etc|maybe|general|automate|automation)\b/i;

const SOLUTION_TERMS =
  /\b(build|app|dashboard|bot|script|tool)\b/i;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isVagueProblem(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (wordCount(t) < 6) return true;
  if (VAGUE_TERMS.test(t) && wordCount(t) < 12) return true;
  if (SOLUTION_TERMS.test(t) && !/\b(because|when|today|manual|slow|error)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function pmPushbackMessage(problem: string): string {
  if (SOLUTION_TERMS.test(problem) && !/\b(because|when|today)\b/i.test(problem)) {
    return "That sounds like a solution, not a problem — what breaks today if we don't build this?";
  }
  if (VAGUE_TERMS.test(problem)) {
    return "Too vague — name one concrete moment where this hurts. Who's doing what manually right now?";
  }
  return "I need more specificity — what's painful or slow today, in one real scenario?";
}

export function findNearDuplicateTools(
  validation: RequestValidation,
  title: string,
  tools: Tool[],
  currentUserId: string,
): Tool[] {
  const query = `${title} ${validation.problem} ${validation.whoHasIt}`.toLowerCase();
  const keywords = query.split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return [];

  return tools
    .filter(
      (t) =>
        t.submittedBy !== currentUserId &&
        (t.approvalStatus === "approved" || t.approvalStatus === "pending"),
    )
    .map((tool) => {
      const haystack =
        `${tool.name} ${tool.oneLiner} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase();
      const score = keywords.filter((k) => haystack.includes(k)).length;
      return { tool, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ tool }) => tool);
}

export function scopeDownPlan(
  sentence: string,
  validation: RequestValidation,
): string {
  const base = synthesizeIntakePlan(sentence, validation);
  const problem = validation.problem.toLowerCase();

  if (
    problem.includes("dashboard") ||
    problem.includes("portal") ||
    problem.includes("app")
  ) {
    return `${base} Start with the smallest slice — one workflow, one user, one output — not a full product.`;
  }

  if (problem.includes("automate") || problem.includes("every time")) {
    return `${base} Scope v1 to a single repeatable step you can run in under five minutes.`;
  }

  return `${base} Ship the thinnest version that proves value — you can expand after it's in the catalogue.`;
}

export function recommendBuildPath(
  prerequisites: RequestPrerequisites,
  validation: RequestValidation,
  sentence = "",
): BuildPathRecommendation {
  const haystack =
    `${sentence} ${validation.problem} ${validation.expectedValue} ${validation.whoHasIt} ${validation.frequency} ${prerequisites.inputsOutputs} ${prerequisites.systems}`.toLowerCase();

  const whoCount = validation.whoHasIt.match(/\d+/);
  const manyUsers = whoCount ? parseInt(whoCount[0], 10) >= 8 : false;
  const needsUi =
    haystack.includes("ui") ||
    haystack.includes("upload") ||
    haystack.includes("form") ||
    haystack.includes("browser") ||
    haystack.includes("click") ||
    haystack.includes("prototype");

  if (
    !needsUi &&
    !manyUsers &&
    (haystack.includes("repeat") ||
      haystack.includes("every time") ||
      haystack.includes("checklist") ||
      haystack.includes("template") ||
      haystack.includes("format") ||
      haystack.includes("summar") ||
      haystack.includes("draft") ||
      haystack.includes("rewrite") ||
      (haystack.includes("automate") && !haystack.includes("dashboard")))
  ) {
    return {
      path: "claude-skill",
      headline: "You don't need an app — a Claude skill does this.",
      rationale:
        "Repeatable, text-in/text-out work with no shared UI — package it as a skill others can invoke.",
      firstSteps: [
        "Write a SKILL.md with inputs, steps, and output format.",
        "Test on three real examples from your team.",
        "Register it so the next person finds it before rebuilding.",
      ],
      toolType: "skill",
    };
  }

  if (
    prerequisites.usesLLM === "yes" &&
    (haystack.includes("agent") ||
      haystack.includes("callable") ||
      haystack.includes("mcp") ||
      haystack.includes("other tools"))
  ) {
    return {
      path: "claude-skill-mcp",
      headline: "A Claude skill / MCP — callable by agents.",
      rationale:
        "Other tools or agents need to call this capability — expose it as a skill with an MCP surface.",
      firstSteps: [
        "Define the single capability agents should call.",
        "Prototype as a skill, then add MCP if cross-tool calls matter.",
        "Document inputs/outputs and register when stable.",
      ],
      toolType: "mcp",
    };
  }

  if (
    needsUi &&
    !manyUsers &&
    (haystack.includes("prototype") ||
      haystack.includes("quick") ||
      haystack.includes("demo") ||
      haystack.includes("try"))
  ) {
    return {
      path: "replit",
      headline: "Spin it up on Replit.",
      rationale:
        "You need a quick UI to try the idea — Replit gets a prototype in front of users fast.",
      firstSteps: [
        "Sketch one screen: input → action → output.",
        "Build the happy path only — no auth polish yet.",
        "Share the link internally, then register if it sticks.",
      ],
      toolType: "app",
    };
  }

  if (
    haystack.includes("repo") ||
    haystack.includes("github") ||
    haystack.includes("integration") ||
    haystack.includes("api") ||
    haystack.includes("ci") ||
    haystack.includes("deploy") ||
    haystack.includes("refactor") ||
    prerequisites.systems.length > 40
  ) {
    return {
      path: "claude-code",
      headline: "Use Claude Code.",
      rationale:
        "Code-heavy work across a repo or integrations — Claude Code is the right pair-programmer.",
      firstSteps: [
        "Point Claude Code at the repo and name the integration boundary.",
        "Land the smallest PR that unblocks one user.",
        "Register with repo link and owner instructions.",
      ],
      toolType: "script",
    };
  }

  if (
    manyUsers ||
    haystack.includes("dashboard") ||
    haystack.includes("metrics") ||
    haystack.includes("team-wide") ||
    haystack.includes("production")
  ) {
    return {
      path: "real-app",
      headline: "This warrants a real app — here's the stack.",
      rationale:
        "Multiple users, durable UI, or production expectations — build on the golden path (Next.js + Railway + internal auth).",
      firstSteps: [
        "Scope v1 to one role and one job-to-be-done.",
        "Use the golden-path stack unless Platform says otherwise.",
        "Register as planned/beta; admin approval before catalogue visibility.",
      ],
      toolType: "app",
    };
  }

  if (needsUi) {
    return {
      path: "replit",
      headline: "Spin it up on Replit.",
      rationale:
        "Light UI need — prototype first before committing to a full app.",
      firstSteps: [
        "One-page flow with mock data.",
        "Validate with two users this week.",
        "Promote to a real app only if usage sticks.",
      ],
      toolType: "app",
    };
  }

  return {
    path: "claude-skill",
    headline: "You don't need an app — a Claude skill does this.",
    rationale:
      "Defaulting to the lightest path — a skill beats a bespoke app for most internal workflows.",
    firstSteps: [
      "Capture the workflow as a skill prompt + examples.",
      "Run it on live inputs twice.",
      "Register when teammates can reuse it.",
    ],
    toolType: "skill",
  };
}

export type BuildPmRecommendationInput = {
  title: string;
  sentence?: string;
  validation: RequestValidation;
  prerequisites: RequestPrerequisites;
  reuseToolNames?: string[];
  reuseBlockNames?: string[];
  nearMatchTools?: Tool[];
};

export function buildPmRecommendation(
  input: BuildPmRecommendationInput,
): PmRecommendation {
  const haystack = buildIntakeHaystack(
    input.title,
    input.validation,
    input.prerequisites,
  );
  const stakesLevel = computeStakesLevel(input.prerequisites, haystack);
  const buildPath = recommendBuildPath(
    input.prerequisites,
    input.validation,
    input.sentence,
  );
  const scopedPlan = scopeDownPlan(
    input.sentence ?? input.title,
    input.validation,
  );

  let reuseNote: string | undefined;
  if (input.reuseToolNames?.length) {
    reuseNote = `Don't build this — ${input.reuseToolNames.slice(0, 2).join(" and ")} already cover it.`;
  }

  const reasoning: string[] = [];

  if (input.reuseToolNames?.length) {
    reasoning.push(
      `Catalogue already has ${input.reuseToolNames.slice(0, 2).join(" and ")} — reuse before building.`,
    );
  } else if (input.reuseBlockNames?.length) {
    reasoning.push(
      `Building blocks cover part of this: ${input.reuseBlockNames.slice(0, 2).join(", ")}.`,
    );
  }

  const problem = input.validation.problem.trim();
  if (problem) {
    reasoning.push(`Problem: ${problem.replace(/\.$/, "")}.`);
  }
  if (input.validation.whoHasIt.trim()) {
    reasoning.push(`Audience: ${input.validation.whoHasIt.replace(/\.$/, "")}.`);
  }
  if (input.validation.frequency.trim()) {
    reasoning.push(`Frequency: ${input.validation.frequency.replace(/\.$/, "")}.`);
  }
  if (input.validation.expectedValue.trim()) {
    reasoning.push(`Impact: ${input.validation.expectedValue.replace(/\.$/, "")}.`);
  }

  reasoning.push(buildPath.rationale);

  let nearMatchNote: string | undefined;
  const near = input.nearMatchTools ?? [];
  if (near.length > 0) {
    const owner = near[0].owner.name;
  const team = near[0].team;
    nearMatchNote = `${owner} on ${team} already registered something similar (${near[0].name}) — talk to them before duplicating effort.`;
  }

  let stakesNote: string | undefined;
  if (stakesLevel === "high") {
    stakesNote =
      "High stakes (PII, payments, LLM, or new dependency) — loop in Platform before shipping, but you can still scope and build.";
  }

  return {
    reasoning: reasoning.slice(0, 6),
    scopedPlan,
    buildPath,
    stakesLevel,
    reuseNote,
    nearMatchNote,
    stakesNote,
  };
}

export function buildPathToolType(path: BuildPath): ToolType {
  switch (path) {
    case "claude-skill":
      return "skill";
    case "claude-skill-mcp":
      return "mcp";
    case "replit":
    case "real-app":
      return "app";
    case "claude-code":
      return "script";
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

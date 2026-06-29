import { searchTools } from "@/lib/askBar";
import { DECISION_RULES } from "@/lib/mockDecisionRules";
import type {
  BuildingBlock,
  ChosenApproach,
  ChosenStack,
  DecisionRule,
  RequestPrerequisites,
  RequestValidation,
  RiskAnswer,
  StakesLevel,
  Tool,
  ToolType,
} from "@/lib/types";

export const GOLDEN_PATH_STACK: ChosenStack = {
  framework: "Next.js",
  hosting: "Railway",
  auth: "Internal auth (Guardian)",
};

const HIGH_STAKES_TEXT_TERMS = [
  "pii",
  "personal data",
  "gdpr",
  "payment",
  "pci",
  "card",
  "llm",
  "gpt",
  "openai",
  "claude",
  "model",
  "scrape",
  "crawl",
  "external",
  "vendor",
  "third-party",
  "third party",
];

const RISK_FIELDS = [
  "touchesPII",
  "touchesPayments",
  "usesLLM",
  "needsExternalDep",
] as const satisfies readonly (keyof RequestPrerequisites)[];

export function riskAnswerIsHigh(answer: RiskAnswer): boolean {
  return answer === "yes" || answer === "unsure";
}

export function detectHighStakesKeywords(haystack: string): boolean {
  const q = haystack.toLowerCase();
  return HIGH_STAKES_TEXT_TERMS.some((term) => q.includes(term));
}

export function computeStakesLevel(
  prerequisites: RequestPrerequisites,
  freeTextHaystack = "",
): StakesLevel {
  for (const key of RISK_FIELDS) {
    if (riskAnswerIsHigh(prerequisites[key])) {
      return "high";
    }
  }

  const combined = `${freeTextHaystack} ${buildPrerequisitesHaystack(prerequisites)}`;
  if (detectHighStakesKeywords(combined)) {
    return "high";
  }

  return "low";
}

export function searchBuildingBlocks(
  query: string,
  blocks: BuildingBlock[],
): BuildingBlock[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const keywords = q.split(/\s+/).filter((w) => w.length >= 2);
  if (keywords.length === 0) return [];

  return blocks
    .map((block) => {
      const haystack =
        `${block.name} ${block.description} ${block.capabilityTags.join(" ")} ${block.kind}`.toLowerCase();
      const score = keywords.filter((k) => haystack.includes(k)).length;
      return { block, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ block }) => block);
}

export function buildPrerequisitesHaystack(
  prerequisites: RequestPrerequisites,
): string {
  return [
    prerequisites.dataSources,
    prerequisites.systems,
    prerequisites.inputsOutputs,
    prerequisites.touchesPII === "yes" ? "pii personal data" : "",
    prerequisites.touchesPayments === "yes" ? "payments pci card" : "",
    prerequisites.usesLLM === "yes" ? "llm ai model gpt" : "",
    prerequisites.needsExternalDep === "yes"
      ? "external vendor api dependency"
      : "",
  ]
    .join(" ")
    .toLowerCase();
}

export function buildIntakeHaystack(
  title: string,
  validation: RequestValidation,
  prerequisites: RequestPrerequisites,
): string {
  return `${title} ${validation.problem} ${validation.whoHasIt} ${validation.frequency} ${buildPrerequisitesHaystack(prerequisites)}`;
}

export type FunnelReuseMatches = {
  tools: Tool[];
  blocks: BuildingBlock[];
  rules: DecisionRule[];
};

export function matchFunnelReuse(
  haystack: string,
  tools: Tool[],
  blocks: BuildingBlock[],
): FunnelReuseMatches {
  const matchedTools = searchTools(haystack, tools);
  const matchedBlocks = searchBuildingBlocks(haystack, blocks);
  const rules = matchDecisionRules(haystack);

  const blockIdsFromRules = new Set(
    rules
      .filter((r) => r.recommend.type === "buildingBlock")
      .map((r) =>
        r.recommend.type === "buildingBlock" ? r.recommend.buildingBlockId : "",
      ),
  );

  const extraBlocks = blocks.filter((b) => blockIdsFromRules.has(b.id));
  const mergedBlocks = [
    ...matchedBlocks,
    ...extraBlocks.filter((b) => !matchedBlocks.some((m) => m.id === b.id)),
  ];

  return { tools: matchedTools, blocks: mergedBlocks, rules };
}

export function hasReuseMatches(matches: FunnelReuseMatches): boolean {
  return matches.tools.length > 0 || matches.blocks.length > 0;
}

export function matchDecisionRules(haystack: string): DecisionRule[] {
  const q = haystack.toLowerCase();
  return DECISION_RULES.filter((rule) =>
    rule.matches.some((term) => q.includes(term)),
  );
}

export const FUNNEL_BUILD_TYPES = [
  "app",
  "mcp",
  "skill",
  "script",
] as const satisfies readonly ToolType[];

export function synthesizeIntakePlan(
  sentence: string,
  validation: RequestValidation,
): string {
  const who = validation.whoHasIt.trim();
  const problem = validation.problem.trim();
  const impact = validation.expectedValue.trim();
  const parts: string[] = [];

  const need = sentence.trim().replace(/\.$/, "");
  if (need) {
    const normalized = need.replace(/^[Tt]o\s+/, "");
    parts.push(
      `You want to ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}.`,
    );
  }

  if (problem) {
    const p =
      problem.charAt(0).toLowerCase() + problem.slice(1).replace(/\.$/, "");
    parts.push(`Today, ${p}.`);
  }

  if (who) {
    parts.push(`This affects ${who.replace(/\.$/, "")}.`);
  }

  if (impact) {
    const i =
      impact.charAt(0).toLowerCase() + impact.slice(1).replace(/\.$/, "");
    parts.push(`Solving it would ${i}.`);
  }

  return parts.join(" ") || "We'll refine this plan as you build.";
}

export function recommendApproach(
  prerequisites: RequestPrerequisites,
  validation: RequestValidation,
  sentence = "",
): ChosenApproach {
  const haystack =
    `${sentence} ${validation.problem} ${validation.expectedValue} ${validation.whoHasIt} ${prerequisites.inputsOutputs} ${prerequisites.systems}`.toLowerCase();

  if (
    haystack.includes("dashboard") ||
    haystack.includes("metrics") ||
    haystack.includes("analytics") ||
    haystack.includes("looker") ||
    haystack.includes("grafana") ||
    haystack.includes("report") ||
    haystack.includes("kpi") ||
    haystack.includes("chart")
  ) {
    return {
      form: "app",
      recommendation:
        "Read-heavy metrics and monitoring — build as an app others can bookmark.",
    };
  }

  if (
    haystack.includes("script") ||
    haystack.includes("cron") ||
    haystack.includes("cli") ||
    haystack.includes("scheduled") ||
    haystack.includes("batch job") ||
    (haystack.includes("automate") &&
      !haystack.includes("ui") &&
      !haystack.includes("agent"))
  ) {
    return {
      form: "script",
      recommendation:
        "Batch or scheduled work without a UI — start as a script on the golden-path stack.",
    };
  }

  if (
    prerequisites.usesLLM === "yes" &&
    (haystack.includes("automate") ||
      haystack.includes("agent") ||
      haystack.includes("workflow"))
  ) {
    return {
      form: "skill",
      recommendation:
        "Agent-driven task — start with a skill (or MCP if other tools need to call it).",
    };
  }

  if (
    haystack.includes("mcp") ||
    haystack.includes("callable") ||
    haystack.includes("other tools") ||
    haystack.includes("agents should")
  ) {
    return {
      form: "mcp",
      recommendation:
        "Capability other tools/agents should call — expose as MCP.",
    };
  }

  if (
    haystack.includes("ui") ||
    haystack.includes("upload") ||
    haystack.includes("human") ||
    haystack.includes("browser") ||
    haystack.includes("form")
  ) {
    return {
      form: "app",
      recommendation: "Needs a human UI — build as an app.",
    };
  }

  return {
    form: "app",
    recommendation:
      "Defaulting to app — adjust if this is agent-only or callable infrastructure.",
  };
}

export function isGoldenPathStack(stack: ChosenStack): boolean {
  return (
    stack.framework === GOLDEN_PATH_STACK.framework &&
    stack.hosting === GOLDEN_PATH_STACK.hosting &&
    stack.auth === GOLDEN_PATH_STACK.auth
  );
}

export function stackNeedsHardGate(
  stakesLevel: StakesLevel,
  stack: ChosenStack,
): boolean {
  if (stakesLevel === "high") return true;
  return !isGoldenPathStack(stack);
}

export function approachNeedsHardGate(
  stakesLevel: StakesLevel,
  approach: ChosenApproach,
  recommendedForm: ToolType,
): boolean {
  if (stakesLevel !== "high") return false;
  return Boolean(approach.override && approach.form !== recommendedForm);
}

export function hardGateReason(
  stakesLevel: StakesLevel,
  stack: ChosenStack,
  prerequisites: RequestPrerequisites,
): string {
  const reasons: string[] = [];
  if (prerequisites.touchesPII !== "no") reasons.push("PII risk flagged");
  if (prerequisites.touchesPayments !== "no") reasons.push("payments risk flagged");
  if (prerequisites.usesLLM !== "no") reasons.push("LLM usage flagged");
  if (prerequisites.needsExternalDep !== "no") {
    reasons.push("external dependency flagged");
  }
  if (!isGoldenPathStack(stack)) reasons.push("deviates from golden-path stack");
  if (stakesLevel === "high" && reasons.length === 0) {
    reasons.push("high-stakes prerequisites");
  }
  return `Why this is gated: ${reasons.join(", ")}. Admin sign-off required before this planned tool goes live.`;
}

export function filterBuildingBlocks(
  blocks: BuildingBlock[],
  search: string,
): BuildingBlock[] {
  const q = search.toLowerCase().trim();
  if (!q) return blocks;

  return blocks.filter((block) => {
    const haystack =
      `${block.name} ${block.description} ${block.capabilityTags.join(" ")} ${block.kind}`.toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

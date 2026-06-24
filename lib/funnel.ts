import { searchTools } from "@/lib/askBar";
import { DECISION_RULES } from "@/lib/mockDecisionRules";
import type {
  BuildingBlock,
  ChosenApproach,
  ChosenStack,
  DecisionRule,
  NeedRequest,
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

export function findNearDuplicateRequests(
  validation: RequestValidation,
  title: string,
  requests: NeedRequest[],
): NeedRequest[] {
  const query = `${title} ${validation.problem} ${validation.whoHasIt}`.toLowerCase();
  const keywords = query.split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return [];

  return requests
    .filter((r) => r.status === "open" || r.status === "claimed")
    .map((request) => {
      const haystack =
        `${request.title} ${request.problem} ${request.tags.join(" ")}`.toLowerCase();
      const score = keywords.filter((k) => haystack.includes(k)).length;
      return { request, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ request }) => request);
}

export function recommendApproach(
  prerequisites: RequestPrerequisites,
  validation: RequestValidation,
): ChosenApproach {
  const haystack = `${validation.problem} ${prerequisites.inputsOutputs} ${prerequisites.systems}`.toLowerCase();

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
    haystack.includes("dashboard") ||
    haystack.includes("human") ||
    haystack.includes("browser")
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

export function filterRegistryNeeds(
  requests: NeedRequest[],
  search: string,
): NeedRequest[] {
  const q = search.toLowerCase().trim();
  const pool = requests.filter(
    (r) => r.status === "open" || r.status === "claimed" || r.status === "parked",
  );
  if (!q) return pool;

  return pool.filter((request) => {
    const haystack = [
      request.title,
      request.problem,
      request.tags.join(" "),
      request.parkedReason ?? "",
      request.sourceQuery ?? "",
      request.reuseOverrideNote ?? "",
      request.validation?.problem ?? "",
      request.validation?.whoHasIt ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => word.length < 2 || haystack.includes(word));
  });
}

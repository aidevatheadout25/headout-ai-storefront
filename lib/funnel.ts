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
  StakesLevel,
  Tool,
  ToolType,
} from "@/lib/types";

export const GOLDEN_PATH_STACK: ChosenStack = {
  framework: "Next.js",
  hosting: "Railway",
  auth: "Internal auth (Guardian)",
};

export function computeStakesLevel(
  prerequisites: RequestPrerequisites,
): StakesLevel {
  if (
    prerequisites.touchesPII ||
    prerequisites.touchesPayments ||
    prerequisites.usesLLM ||
    prerequisites.needsExternalDep
  ) {
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
    prerequisites.touchesPII ? "pii personal data" : "",
    prerequisites.touchesPayments ? "payments pci card" : "",
    prerequisites.usesLLM ? "llm ai model gpt" : "",
    prerequisites.needsExternalDep ? "external vendor api dependency" : "",
  ]
    .join(" ")
    .toLowerCase();
}

export function matchFunnelReuse(
  haystack: string,
  tools: Tool[],
  blocks: BuildingBlock[],
): { tools: Tool[]; blocks: BuildingBlock[]; rules: DecisionRule[] } {
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
    prerequisites.usesLLM &&
    (haystack.includes("automate") ||
      haystack.includes("agent") ||
      haystack.includes("workflow"))
  ) {
    return {
      form: "skill",
      recommendation:
        "Agent-driven task — start with a Skill (or MCP if other tools need to call it).",
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
      recommendation: "Needs a human UI — build as an App.",
    };
  }

  return {
    form: "app",
    recommendation:
      "Defaulting to App — adjust if this is agent-only or callable infrastructure.",
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
  if (prerequisites.touchesPII) reasons.push("touches PII");
  if (prerequisites.touchesPayments) reasons.push("touches payments");
  if (prerequisites.usesLLM) reasons.push("uses LLM");
  if (prerequisites.needsExternalDep) reasons.push("new external dependency");
  if (!isGoldenPathStack(stack)) reasons.push("deviates from golden-path stack");
  if (stakesLevel === "high" && reasons.length === 0) {
    reasons.push("high-stakes prerequisites");
  }
  return `Why this is gated: ${reasons.join(", ")}. Admin sign-off needed (mocked).`;
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

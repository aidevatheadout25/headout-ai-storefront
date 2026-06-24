import type { MockUser, NeedRequest, Tool } from "@/lib/types";

export const MOCK_USERS: MockUser[] = [
  {
    id: "alex-kim",
    name: "Alex Kim",
    slackId: "@alex.kim",
    team: "Applied AI",
    role: "viewer",
  },
  {
    id: "jordan-lee",
    name: "Jordan Lee",
    slackId: "@jordan.lee",
    team: "Platform",
    role: "builder",
  },
  {
    id: "maya-patel",
    name: "Maya Patel",
    slackId: "@maya.p",
    team: "Supply Ops",
    role: "builder",
  },
  {
    id: "tom-walsh",
    name: "Tom Walsh",
    slackId: "@tom.w",
    team: "Growth",
    role: "viewer",
  },
  {
    id: "sofia-reyes",
    name: "Sofia Reyes",
    slackId: "@sofia.r",
    team: "Content",
    role: "viewer",
  },
  {
    id: "priya-sharma",
    name: "Priya Sharma",
    slackId: "@priya.s",
    team: "Applied AI",
    role: "builder",
  },
];

export const INITIAL_REQUESTS: NeedRequest[] = [
  {
    id: "req-campaign-image-resize",
    title: "Bulk-resize campaign images",
    problem:
      "Growth needs a tool to batch-resize and crop campaign creatives to Headout specs before every city launch — Figma exports are inconsistent.",
    requestedBy: { name: "Tom Walsh", slackId: "@tom.w" },
    requestedById: "tom-walsh",
    team: "Growth",
    tags: ["images", "campaigns", "growth", "figma"],
    upvotes: 14,
    upvotedBy: ["tom-walsh", "sofia-reyes", "maya-patel"],
    status: "open",
    createdAt: "2026-06-20T10:00:00Z",
    stakesLevel: "low",
    sourceQuery: "bulk resize campaign images",
    prerequisites: {
      dataSources: "Figma exports, GCS campaign asset bucket",
      systems: "Growth creative workflow, CMS image slots",
      inputsOutputs: "Upload PNG/JPG batches → resized/cropped assets per city spec",
      touchesPII: "no",
      touchesPayments: "no",
      usesLLM: "no",
      needsExternalDep: "no",
    },
    validation: {
      problem:
        "Analysts manually resize dozens of creatives per city launch — inconsistent crops slow go-live.",
      whoHasIt: "Growth campaign ops (6 people), every 2 weeks at launch",
      frequency: "Every 2 weeks at city launch",
      currentWorkaround: "Manual resize in Figma + ad-hoc scripts in Slack threads",
      expectedValue: "Save ~4 hours per launch; fewer wrong-aspect assets in CMS",
    },
  },
  {
    id: "req-policy-qa-bot",
    title: "Searchable policy Q&A bot",
    problem:
      "People keep asking HR the same policy questions in Slack. We need a searchable internal bot that answers from the employee handbook.",
    requestedBy: { name: "Sofia Reyes", slackId: "@sofia.r" },
    requestedById: "sofia-reyes",
    team: "Content",
    tags: ["slack", "hr", "policy", "qa"],
    upvotes: 9,
    upvotedBy: ["sofia-reyes", "alex-kim"],
    status: "open",
    createdAt: "2026-06-18T14:00:00Z",
  },
  {
    id: "req-llm-spend-dashboard",
    title: "Internal LLM spend dashboard",
    problem:
      "Applied AI needs a single dashboard for model spend across internal apps — right now costs are scattered across BigQuery exports.",
    requestedBy: { name: "Priya Sharma", slackId: "@priya.s" },
    requestedById: "priya-sharma",
    team: "Applied AI",
    tags: ["llm", "cost", "dashboard", "analytics"],
    upvotes: 6,
    upvotedBy: ["priya-sharma", "jordan-lee"],
    status: "open",
    createdAt: "2026-06-15T09:30:00Z",
  },
  {
    id: "req-pdp-image-pipeline",
    title: "PDP image optimiser pipeline",
    problem:
      "Content team needs a plugin to compress and crop product images to PDP specs — manual exports slow every launch.",
    requestedBy: { name: "Sofia Reyes", slackId: "@sofia.r" },
    requestedById: "sofia-reyes",
    team: "Content",
    tags: ["images", "pdp", "cms", "figma"],
    upvotes: 11,
    upvotedBy: ["sofia-reyes", "maya-patel", "tom-walsh"],
    status: "claimed",
    claimedBy: { name: "Alex Kim", slackId: "@alex.kim" },
    claimedById: "alex-kim",
    linkedToolId: "pdp-image-optimiser",
    createdAt: "2026-06-10T11:00:00Z",
  },
  {
    id: "req-ad-copy-scoring",
    title: "Ad copy scoring for campaigns",
    problem:
      "Growth analysts paste ad copy into docs and manually score against playbooks. We need a quick web scorer before campaigns go live.",
    requestedBy: { name: "Tom Walsh", slackId: "@tom.w" },
    requestedById: "tom-walsh",
    team: "Growth",
    tags: ["ads", "copy", "qa", "growth"],
    upvotes: 18,
    upvotedBy: ["tom-walsh", "sofia-reyes", "alex-kim", "maya-patel"],
    status: "fulfilled",
    claimedBy: { name: "Alex Kim", slackId: "@alex.kim" },
    claimedById: "alex-kim",
    linkedToolId: "ad-copy-qa",
    createdAt: "2026-05-22T08:00:00Z",
  },
];

export function findRequestDedupMatches(
  title: string,
  problem: string,
  requests: NeedRequest[],
  tools: Tool[],
): { requests: NeedRequest[]; tools: Tool[] } {
  const query = `${title} ${problem}`.toLowerCase().trim();
  if (query.length < 3) {
    return { requests: [], tools: [] };
  }

  const keywords = query.split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length === 0) {
    return { requests: [], tools: [] };
  }

  const scoredRequests = requests
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

  const scoredTools = tools
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

  return { requests: scoredRequests, tools: scoredTools };
}

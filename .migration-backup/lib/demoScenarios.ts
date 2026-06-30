import type { ChatMessage, DemoMode } from "@/lib/chatTypes";
import type { PmRecommendation, Tool } from "@/lib/types";

function scriptMessage(
  mode: DemoMode,
  index: number,
  role: "user" | "assistant",
  text: string,
  attachment?: ChatMessage["attachment"],
): ChatMessage {
  return {
    id: `demo-${mode}-${index}`,
    role,
    text,
    attachment,
  };
}

const SCOPE_SKILL_RECOMMENDATION: PmRecommendation = {
  reasoning: [
    "Problem: weekly competitor price copy into a spreadsheet before campaign tweaks.",
    "Audience: three Growth analysts plus PMs who skim summaries.",
    "Frequency: every Monday, ~90 minutes manual.",
    "Impact: delays pricing calls and invites copy-paste errors.",
    "Repeatable, text-in/text-out work with no shared UI — package it as a skill others can invoke.",
  ],
  scopedPlan:
    "Ship v1 for Viator only, London experiences, bullet summary posted to #growth-pricing — prove the habit before expanding cities or competitors.",
  buildPath: {
    path: "claude-skill",
    headline: "You don't need an app — a Claude skill does this.",
    rationale:
      "Repeatable, text-in/text-out work with no shared UI — package it as a skill others can invoke.",
    firstSteps: [
      "Write a SKILL.md with inputs (competitor URL or city), steps, and Slack-ready output format.",
      "Test on three real Viator London pages from last Monday's sheet.",
      "Register it so the next analyst finds it before rebuilding a scraper.",
    ],
    toolType: "skill",
  },
  stakesLevel: "low",
};

const HIGH_STAKES_RECOMMENDATION: PmRecommendation = {
  reasoning: [
    "Problem: CX agents need last-four charges and refund status when guests email.",
    "Audience: ~15 Zendesk agents during peak season.",
    "Frequency: dozens of refund tickets daily in summer.",
    "Impact: slow lookups extend handle time and erode guest trust.",
    "Multiple users, durable UI, and production expectations — build on the golden path.",
  ],
  scopedPlan:
    "Start read-only: agent pastes booking ID → tool returns masked payment summary and refund state. No writes until Platform signs off on the payments boundary.",
  buildPath: {
    path: "real-app",
    headline: "This warrants a real app — here's the stack.",
    rationale:
      "Multiple agents, durable UI, and production expectations — build on the golden path (Next.js + Railway + internal auth).",
    firstSteps: [
      "Scope v1 to Zendesk sidebar + one booking lookup — mock payment data locally first.",
      "Use the golden-path stack; route all payment reads through Platform-approved APIs.",
      "Register as planned/beta; admin approval before catalogue visibility.",
    ],
    toolType: "app",
  },
  stakesLevel: "high",
  stakesNote:
    "This touches payments — loop in Platform and Security before you ship anything that reads transaction data. You can still scope and prototype on mock data.",
};

export function buildDemoScript(
  mode: DemoMode,
  tools: Tool[],
): ChatMessage[] {
  const imageTool =
    tools.find((t) => t.id === "pdp-image-optimiser") ??
    tools.find((t) => t.tags.includes("images")) ??
    tools[0];

  switch (mode) {
    case "live":
      return [];
    case "exists":
      return buildExistsScript(imageTool);
    case "drop":
      return buildDropScript();
    case "scope":
      return buildScopeScript();
    case "high-stakes":
      return buildHighStakesScript();
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function buildExistsScript(imageTool: Tool | undefined): ChatMessage[] {
  const toolList = imageTool ? [imageTool] : [];
  const openId = imageTool
    ? `open-tool-${imageTool.id}`
    : "open-tool-pdp-image-optimiser";

  return [
    scriptMessage(
      "exists",
      0,
      "user",
      "I need to resize campaign images per city spec.",
    ),
    scriptMessage(
      "exists",
      1,
      "assistant",
      "Reuse first — checking the catalogue for what already handles campaign images per city.",
      toolList.length > 0
        ? { type: "matches", tools: toolList, blocks: [] }
        : undefined,
    ),
    scriptMessage(
      "exists",
      2,
      "assistant",
      imageTool
        ? `This already does it — ${imageTool.name} batch-processes images to Headout specs per launch. Don't rebuild. Want me to open it?`
        : "This already exists in the catalogue — don't rebuild. Want me to open it?",
      {
        type: "quick-replies",
        replies: [
          {
            id: openId,
            label: imageTool ? `Open ${imageTool.name}` : "Open in catalogue",
            variant: "primary",
          },
          {
            id: "demo-browse",
            label: "Keep browsing",
            variant: "secondary",
          },
        ],
      },
    ),
  ];
}

function buildDropScript(): ChatMessage[] {
  return [
    scriptMessage(
      "drop",
      0,
      "user",
      "A bot that renames my screenshots.",
    ),
    scriptMessage(
      "drop",
      1,
      "assistant",
      "Before we build anything — who else hits this? Name the team or role, and roughly how many people.",
    ),
    scriptMessage(
      "drop",
      2,
      "user",
      "Just me on Content — maybe 2–3 screenshots a week before I file a ticket.",
    ),
    scriptMessage(
      "drop",
      3,
      "assistant",
      "How often does it actually block you — daily friction or occasional annoyance?",
    ),
    scriptMessage(
      "drop",
      4,
      "user",
      "Occasional — five minutes when a filename is wrong. I can rename in Finder.",
    ),
    scriptMessage(
      "drop",
      5,
      "assistant",
      "Honest take: Finder or a Preview batch rename covers this today, and macOS already remembers your last pattern.\n\nI wouldn't register this as a catalogue tool — the upside doesn't clear the maintenance bar for a one-person weekly habit.\n\nIf the volume jumps or three teams need the same naming scheme, come back and we'll scope a shared skill instead.",
    ),
  ];
}

function buildScopeScript(): ChatMessage[] {
  return [
    scriptMessage(
      "scope",
      0,
      "user",
      "Summarise competitor pricing pages weekly.",
    ),
    scriptMessage(
      "scope",
      1,
      "assistant",
      "Let's pressure-test this. What's painful today — what are you doing manually?",
    ),
    scriptMessage(
      "scope",
      2,
      "user",
      "Growth analysts copy prices from GetYourGuide and Viator into a sheet every Monday — takes about 90 minutes.",
    ),
    scriptMessage(
      "scope",
      3,
      "assistant",
      "Who needs the output and how many people rely on it?",
    ),
    scriptMessage(
      "scope",
      4,
      "user",
      "Three analysts on Growth plus PMs who skim it before campaign tweaks.",
    ),
    scriptMessage(
      "scope",
      5,
      "assistant",
      "What's the smallest version that proves value — one competitor, one city, one output format?",
    ),
    scriptMessage(
      "scope",
      6,
      "user",
      "Viator only, London experiences, bullet summary in Slack.",
    ),
    scriptMessage(
      "scope",
      7,
      "assistant",
      "Here's how I'd scope this — build the smallest useful version, then register it.",
      {
        type: "pm-recommendation",
        recommendation: SCOPE_SKILL_RECOMMENDATION,
      },
    ),
    scriptMessage(
      "scope",
      8,
      "assistant",
      "Go build it with the path above. When it's working, register it so the next person finds it.",
      {
        type: "register-cta",
        name: "Competitor pricing weekly summary",
        oneLiner:
          "Claude skill that summarises Viator London pricing into Slack-ready bullets.",
        toolType: "skill",
        status: "planned",
      },
    ),
  ];
}

function buildHighStakesScript(): ChatMessage[] {
  return [
    scriptMessage(
      "high-stakes",
      0,
      "user",
      "A tool that pulls customer payment history for refunds.",
    ),
    scriptMessage(
      "high-stakes",
      1,
      "assistant",
      "Sensitive area — let me scope this properly. Who runs refunds today and what system do they use?",
    ),
    scriptMessage(
      "high-stakes",
      2,
      "user",
      "CX agents in Zendesk — they need last four charges and refund status when a guest emails.",
    ),
    scriptMessage(
      "high-stakes",
      3,
      "assistant",
      "Roughly how many agents, and how often does this come up?",
    ),
    scriptMessage(
      "high-stakes",
      4,
      "user",
      "~15 agents, dozens of tickets daily during peak season.",
    ),
    scriptMessage(
      "high-stakes",
      5,
      "assistant",
      "Got it — read-only lookup for agents, but this crosses into payments data. I'll flag the guardrail and still give you a build path.",
    ),
    scriptMessage(
      "high-stakes",
      6,
      "assistant",
      "Scope the thinnest read-only version first — mock payment data until Platform signs off.",
      {
        type: "pm-recommendation",
        recommendation: HIGH_STAKES_RECOMMENDATION,
      },
    ),
    scriptMessage(
      "high-stakes",
      7,
      "assistant",
      "Prototype on mock data, then register when Platform clears the payments boundary.",
      {
        type: "register-cta",
        name: "Refund payment lookup",
        oneLiner:
          "Zendesk sidebar that shows masked payment history for refund tickets.",
        toolType: "app",
        status: "planned",
      },
    ),
  ];
}

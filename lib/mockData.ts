import type { Tool, Kit } from "@/lib/types";

export const DEMO_USER = {
  id: "alex-kim",
  name: "Alex Kim",
  slackId: "@alex.kim",
  team: "Applied AI" as const,
};

export const INITIAL_APPROVED_TOOLS: Tool[] = [
  {
    id: "viator-scraper",
    name: "Viator availability scraper",
    oneLiner: "Pulls live availability from Viator partner API for supply workflows.",
    description:
      "Scheduled scraper that hits the Viator partner API and writes normalized availability snapshots to GCS. Supply Ops uses it to catch listing gaps before they hit conversion. Runs every 4 hours via Cloud Scheduler.",
    type: "script",
    link: "https://github.com/headout/viator-scraper",
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    team: "Supply Ops",
    tags: ["scraping", "viator", "availability", "supply"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/viator-scraper",
    status: "approved",
    submittedBy: "maya-patel",
    usageStats: { views: 342, clicks: 89, helpful: 24 },
  },
  {
    id: "bq-availability-dashboard",
    name: "BigQuery availability dashboard",
    oneLiner: "Looker dashboard for real-time inventory and availability across suppliers.",
    description:
      "Central Looker dashboard wired to BigQuery tables for inventory health, OOS rates, and supplier SLA breaches. Platform team maintains the underlying dbt models.",
    type: "dashboard",
    link: "https://looker.headout.internal/dashboards/availability",
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    team: "Platform",
    tags: ["bigquery", "looker", "inventory", "analytics"],
    accessLevel: "gated",
    accessContact: "@jordan.lee in #data-platform",
    status: "approved",
    submittedBy: "jordan-lee",
    usageStats: { views: 518, clicks: 201, helpful: 41 },
  },
  {
    id: "claude-cf-audit",
    name: "Claude CF-audit skill",
    oneLiner: "Audits Cloudflare configs against Headout security baselines.",
    description:
      "Claude Code skill that reads CF zone exports and flags misconfigured WAF rules, TLS settings, and cache policies. Outputs a markdown report with severity tags.",
    type: "skill",
    link: "https://github.com/headout/skills/tree/main/cf-audit",
    owner: { name: "Alex Kim", slackId: "@alex.kim" },
    team: "Applied AI",
    tags: ["claude", "cloudflare", "security", "audit"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/skills/tree/main/cf-audit",
    status: "approved",
    submittedBy: "alex-kim",
    usageStats: { views: 156, clicks: 67, helpful: 18 },
  },
  {
    id: "slack-qa-bot",
    name: "Slack content QA bot",
    oneLiner: "Flags grammar, tone, and brand-voice issues in content drafts.",
    description:
      "Slack bot that listens in #content-review. Paste a draft or link a Google Doc — it returns inline suggestions aligned to Headout voice guidelines.",
    type: "slack-bot",
    link: "https://slack.com/app_redirect?app=content-qa-bot",
    owner: { name: "Sofia Reyes", slackId: "@sofia.r" },
    team: "Content",
    tags: ["slack", "qa", "content", "brand-voice"],
    accessLevel: "open",
    status: "approved",
    submittedBy: "sofia-reyes",
    usageStats: { views: 289, clicks: 134, helpful: 52 },
  },
  {
    id: "pricing-audit-mcp",
    name: "Pricing audit MCP",
    oneLiner: "MCP server that compares Headout prices against OTAs in real time.",
    description:
      "Model Context Protocol server exposing search_pricing_gaps and get_competitor_rates tools. Growth analysts plug it into Claude Code for ad-hoc pricing investigations.",
    type: "mcp",
    link: "https://github.com/headout/mcp-pricing-audit",
    owner: { name: "Tom Walsh", slackId: "@tom.w" },
    team: "Growth",
    tags: ["mcp", "pricing", "competitive", "claude"],
    accessLevel: "gated",
    accessContact: "@tom.w in #growth-tools",
    githubUrl: "https://github.com/headout/mcp-pricing-audit",
    status: "approved",
    submittedBy: "tom-walsh",
    usageStats: { views: 198, clicks: 72, helpful: 31 },
  },
  {
    id: "ad-copy-qa",
    name: "Content ad-copy QA tool",
    oneLiner: "Web app that scores ad copy against Headout performance playbooks.",
    description:
      "Paste ad copy and get a scorecard: headline strength, CTA clarity, character limits per channel, and A/B test suggestions. Built on Replit, wired to our brand guidelines doc.",
    type: "app",
    link: "https://adcopy-qa.headout.tools",
    owner: { name: "Alex Kim", slackId: "@alex.kim" },
    team: "Content",
    tags: ["ads", "copy", "qa", "growth"],
    accessLevel: "open",
    status: "approved",
    submittedBy: "alex-kim",
    usageStats: { views: 412, clicks: 178, helpful: 63 },
  },
  {
    id: "guardian-auth-plugin",
    name: "Guardian auth plugin",
    oneLiner: "Drop-in Guardian SSO for internal Replit and Vercel apps.",
    description:
      "Next.js middleware plugin that handles Google Workspace SSO via Guardian. One import gives you session management and role checks for internal tools.",
    type: "plugin",
    link: "https://github.com/headout/guardian-auth-plugin",
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    team: "Platform",
    tags: ["auth", "guardian", "sso", "plugin"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/guardian-auth-plugin",
    status: "approved",
    submittedBy: "jordan-lee",
    usageStats: { views: 267, clicks: 95, helpful: 29 },
  },
  {
    id: "competitor-price-monitor",
    name: "Competitor price monitor",
    oneLiner: "Daily scraper that tracks OTA pricing for top 500 SKUs.",
    description:
      "Python script on a cron that scrapes GetYourGuide, Viator, and Klook listing pages. Diffs land in BigQuery; alerts fire in #growth-pricing when gaps exceed 8%.",
    type: "script",
    link: "https://github.com/headout/competitor-price-monitor",
    owner: { name: "Tom Walsh", slackId: "@tom.w" },
    team: "Growth",
    tags: ["scraping", "pricing", "competitive"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/competitor-price-monitor",
    status: "approved",
    submittedBy: "tom-walsh",
    usageStats: { views: 231, clicks: 58, helpful: 15 },
  },
  {
    id: "seo-meta-skill",
    name: "SEO meta generator skill",
    oneLiner: "Claude skill that drafts SEO titles and meta descriptions at scale.",
    description:
      "Feed it a product ID or URL slug — it pulls live PDP data and drafts title tags, meta descriptions, and OG copy following Headout SEO templates.",
    type: "skill",
    link: "https://github.com/headout/skills/tree/main/seo-meta",
    owner: { name: "Alex Kim", slackId: "@alex.kim" },
    team: "Growth",
    tags: ["seo", "claude", "content", "metadata"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/skills/tree/main/seo-meta",
    status: "approved",
    submittedBy: "alex-kim",
    usageStats: { views: 174, clicks: 81, helpful: 22 },
  },
  {
    id: "inventory-sync-dashboard",
    name: "Inventory sync dashboard",
    oneLiner: "Tracks supplier feed sync latency and error rates across integrations.",
    description:
      "Grafana dashboard showing last-sync timestamps, error counts, and retry queues for every supplier integration. Red rows mean a feed is stale.",
    type: "dashboard",
    link: "https://grafana.headout.internal/d/inventory-sync",
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    team: "Supply Ops",
    tags: ["inventory", "suppliers", "monitoring"],
    accessLevel: "gated",
    accessContact: "@maya.p in #supply-ops",
    status: "approved",
    submittedBy: "maya-patel",
    usageStats: { views: 445, clicks: 167, helpful: 38 },
  },
  {
    id: "booking-debug-mcp",
    name: "Booking debug MCP",
    oneLiner: "MCP tools for tracing booking failures end-to-end in staging.",
    description:
      "Exposes get_booking_trace, search_payment_errors, and replay_webhook MCP tools. Platform engineers use it in Claude Code to debug Zapdos checkout issues.",
    type: "mcp",
    link: "https://github.com/headout/mcp-booking-debug",
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    team: "Platform",
    tags: ["mcp", "booking", "debug", "zapdos"],
    accessLevel: "gated",
    accessContact: "@jordan.lee in #platform-eng",
    githubUrl: "https://github.com/headout/mcp-booking-debug",
    status: "approved",
    submittedBy: "jordan-lee",
    usageStats: { views: 133, clicks: 49, helpful: 17 },
  },
  {
    id: "zendesk-triage-bot",
    name: "Zendesk triage bot",
    oneLiner: "Auto-classifies and routes support tickets using Headout taxonomies.",
    description:
      "Slack-integrated bot that reads incoming Zendesk tickets, suggests priority and assignee, and drafts first-response templates. Applied AI team maintains the classifier.",
    type: "slack-bot",
    link: "https://slack.com/app_redirect?app=zendesk-triage",
    owner: { name: "Priya Sharma", slackId: "@priya.s" },
    team: "Applied AI",
    tags: ["slack", "zendesk", "support", "triage"],
    accessLevel: "open",
    status: "approved",
    submittedBy: "priya-sharma",
    usageStats: { views: 201, clicks: 88, helpful: 27 },
  },
  {
    id: "pdp-image-optimiser",
    name: "PDP image optimiser",
    oneLiner: "Plugin that compresses and crops product images to Headout specs.",
    description:
      "Figma and CMS plugin that batch-processes product images: correct aspect ratio, WebP conversion, alt-text suggestions. Content team runs it before every city launch.",
    type: "plugin",
    link: "https://github.com/headout/pdp-image-optimiser",
    owner: { name: "Sofia Reyes", slackId: "@sofia.r" },
    team: "Content",
    tags: ["images", "cms", "figma", "pdp"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/pdp-image-optimiser",
    status: "approved",
    submittedBy: "sofia-reyes",
    usageStats: { views: 118, clicks: 44, helpful: 11 },
  },
  {
    id: "tour-editor-replit",
    name: "Tour editor Replit app",
    oneLiner: "Lightweight editor for supply ops to update tour copy and inclusions.",
    description:
      "Replit-hosted internal app with a form-based UI for updating tour descriptions, inclusions, and meeting points. Writes directly to the supply CMS API.",
    type: "app",
    link: "https://tour-editor.headout.tools",
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    team: "Supply Ops",
    tags: ["replit", "tours", "cms", "supply"],
    accessLevel: "gated",
    accessContact: "@maya.p in #supply-ops",
    status: "approved",
    submittedBy: "maya-patel",
    usageStats: { views: 276, clicks: 112, helpful: 33 },
  },
];

export const KITS: Kit[] = [
  {
    id: "essentials",
    name: "Essentials",
    description: "Cross-team staples everyone reaches for — auth, QA, dashboards, and support.",
    toolIds: [
      "guardian-auth-plugin",
      "slack-qa-bot",
      "zendesk-triage-bot",
      "claude-cf-audit",
      "bq-availability-dashboard",
      "ad-copy-qa",
    ],
    accentVar: "--color-dreamypale-400",
  },
  {
    id: "supply-ops",
    name: "Supply Ops",
    description: "Scrapers, inventory sync, and tour editing for the supply team.",
    toolIds: [
      "viator-scraper",
      "inventory-sync-dashboard",
      "tour-editor-replit",
    ],
    accentVar: "--color-peachyorange-300",
  },
  {
    id: "growth",
    name: "Growth",
    description: "Pricing, competitive intel, and SEO tooling for growth analysts.",
    toolIds: [
      "pricing-audit-mcp",
      "competitor-price-monitor",
      "seo-meta-skill",
    ],
    accentVar: "--color-joymustard-300",
  },
  {
    id: "content",
    name: "Content",
    description: "Copy QA, ad scoring, and image tooling for the content team.",
    toolIds: [
      "slack-qa-bot",
      "ad-copy-qa",
      "pdp-image-optimiser",
    ],
    accentVar: "--color-candy-200",
  },
  {
    id: "applied-ai-platform",
    name: "Applied AI / Platform",
    description: "Skills, MCPs, auth, and infra debug tools for builders.",
    toolIds: [
      "claude-cf-audit",
      "booking-debug-mcp",
      "zendesk-triage-bot",
      "guardian-auth-plugin",
      "bq-availability-dashboard",
    ],
    accentVar: "--color-oceanblue-200",
  },
];

export function getKitById(id: string): Kit | undefined {
  return KITS.find((kit) => kit.id === id);
}

export function getKitToolCount(kit: Kit, tools: Tool[]): number {
  const approvedIds = new Set(
    tools.filter((t) => t.status === "approved").map((t) => t.id),
  );
  return kit.toolIds.filter((id) => approvedIds.has(id)).length;
}

export function getToolsForKit(kit: Kit, tools: Tool[]): Tool[] {
  const idSet = new Set(kit.toolIds);
  return tools.filter((t) => t.status === "approved" && idSet.has(t.id));
}

export const INITIAL_PENDING_TOOLS: Tool[] = [
  {
    id: "gttd-feed-validator",
    name: "GTTD feed validator",
    oneLiner: "Validates Google Things to Do feed XML before submission.",
    description:
      "CLI script that lints GTTD feed files against Google's schema and Headout-specific rules. Catches missing geo coordinates and invalid price formats.",
    type: "script",
    link: "https://github.com/headout/gttd-validator",
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    team: "Supply Ops",
    tags: ["gttd", "google", "feed", "validation"],
    accessLevel: "open",
    githubUrl: "https://github.com/headout/gttd-validator",
    status: "pending",
    submittedBy: "maya-patel",
    usageStats: { views: 0, clicks: 0, helpful: 0 },
  },
  {
    id: "agent-memory-plugin",
    name: "Agent memory plugin",
    oneLiner: "Persists Claude agent context across sessions for internal tools.",
    description:
      "Plugin that stores conversation summaries and tool outputs in a lightweight KV store. Lets multi-step agent workflows resume where they left off.",
    type: "plugin",
    link: "https://github.com/headout/agent-memory",
    owner: { name: "Priya Sharma", slackId: "@priya.s" },
    team: "Applied AI",
    tags: ["claude", "agents", "memory", "plugin"],
    accessLevel: "gated",
    accessContact: "@priya.s in #applied-ai",
    githubUrl: "https://github.com/headout/agent-memory",
    status: "pending",
    submittedBy: "priya-sharma",
    usageStats: { views: 0, clicks: 0, helpful: 0 },
  },
  {
    id: "conversion-funnel-dashboard",
    name: "Conversion funnel dashboard",
    oneLiner: "Tracks PDP → select → checkout → confirm drop-off by city.",
    description:
      "Looker dashboard built on Segment events. Growth team uses it weekly to spot funnel regressions after releases.",
    type: "dashboard",
    link: "https://looker.headout.internal/dashboards/conversion-funnel",
    owner: { name: "Tom Walsh", slackId: "@tom.w" },
    team: "Growth",
    tags: ["conversion", "funnel", "analytics", "growth"],
    accessLevel: "gated",
    accessContact: "@tom.w in #growth-analytics",
    status: "pending",
    submittedBy: "tom-walsh",
    usageStats: { views: 0, clicks: 0, helpful: 0 },
  },
];

export const MOCK_README_PREVIEW = `# Tool README

## Overview
Auto-pulled from GitHub. This is a mocked preview for the demo.

## Setup
\`\`\`bash
npm install
npm run dev
\`\`\`

## Usage
Describe your tool here. The real v1 will parse your actual README.`;

export function findDedupMatches(
  name: string,
  oneLiner: string,
  tools: Tool[],
): Tool[] {
  const query = `${name} ${oneLiner}`.toLowerCase().trim();
  if (query.length < 3) return [];

  const keywords = query.split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length === 0) return [];

  const scored = tools
    .filter((t) => t.status === "approved")
    .map((tool) => {
      const haystack =
        `${tool.name} ${tool.oneLiner} ${tool.tags.join(" ")}`.toLowerCase();
      const score = keywords.filter((k) => haystack.includes(k)).length;
      return { tool, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 2).map(({ tool }) => tool);
}

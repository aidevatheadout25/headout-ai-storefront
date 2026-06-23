import type { BuildingBlock } from "@/lib/types";

export const INITIAL_BUILDING_BLOCKS: BuildingBlock[] = [
  {
    id: "bookings-api",
    name: "Bookings API",
    kind: "api",
    description:
      "Internal REST API for booking reads and writes — inventory holds, confirmations, and cancellations.",
    capabilityTags: ["bookings", "inventory", "orders", "supply"],
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    accessLevel: "request",
    status: "live",
  },
  {
    id: "pricing-service",
    name: "Pricing service",
    kind: "service",
    description:
      "Central pricing engine for dynamic rates, markups, and currency conversion across channels.",
    capabilityTags: ["pricing", "rates", "markup", "currency"],
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    accessLevel: "request",
    status: "live",
  },
  {
    id: "availability-agent",
    name: "Availability agent",
    kind: "agent",
    description:
      "Agent that checks live availability across suppliers and returns normalized slots for workflows.",
    capabilityTags: ["availability", "agent", "supply", "slots"],
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    accessLevel: "open",
    status: "live",
  },
  {
    id: "ai-gateway",
    name: "Internal AI gateway",
    kind: "service",
    description:
      "Approved path for LLM calls — routing, spend caps, PII scrubbing, and model allowlists.",
    capabilityTags: ["llm", "ai", "gateway", "models", "openai"],
    owner: { name: "Alex Kim", slackId: "@alex.kim" },
    accessLevel: "request",
    status: "live",
  },
  {
    id: "notify-api",
    name: "Notify API",
    kind: "api",
    description:
      "Send Slack, email, and push notifications through Headout-approved channels and templates.",
    capabilityTags: ["notifications", "slack", "email", "alerts"],
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    accessLevel: "open",
    status: "live",
  },
  {
    id: "guardian-auth",
    name: "Auth / Guardian",
    kind: "service",
    description:
      "Internal SSO and service-to-service auth — OIDC for apps, scoped tokens for scripts.",
    capabilityTags: ["auth", "sso", "guardian", "security", "oidc"],
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    accessLevel: "open",
    status: "live",
  },
  {
    id: "nextjs-starter",
    name: "Next.js starter framework",
    kind: "framework",
    description:
      "Golden-path internal app template — Next.js, Railway deploy, Guardian auth, design tokens wired.",
    capabilityTags: ["nextjs", "web", "app", "starter", "railway"],
    owner: { name: "Jordan Lee", slackId: "@jordan.lee" },
    accessLevel: "open",
    status: "live",
  },
  {
    id: "scraper-service",
    name: "Scraper service",
    kind: "service",
    description:
      "Managed scraping runtime with proxy rotation, rate limits, and GCS output sinks.",
    capabilityTags: ["scraping", "crawl", "extract", "supply"],
    owner: { name: "Maya Patel", slackId: "@maya.p" },
    accessLevel: "request",
    status: "live",
  },
];

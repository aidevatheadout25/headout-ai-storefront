import type { DecisionRule } from "@/lib/types";

export const DECISION_RULES: DecisionRule[] = [
  {
    id: "rule-llm-gateway",
    matches: ["llm", "gpt", "model", "openai", "claude", "ai"],
    recommend: { type: "buildingBlock", buildingBlockId: "ai-gateway" },
    stakes: "high",
    message:
      "LLM usage must route through the internal AI gateway — not direct vendor keys.",
  },
  {
    id: "rule-notify",
    matches: ["notification", "notify", "slack", "alert", "email", "digest"],
    recommend: { type: "buildingBlock", buildingBlockId: "notify-api" },
    stakes: "low",
    message: "Use Notify API instead of wiring Slack webhooks yourself.",
  },
  {
    id: "rule-web-golden-path",
    matches: ["web", "app", "dashboard", "ui", "portal", "tool"],
    recommend: { type: "text", text: "Next.js + Railway + internal auth" },
    stakes: "low",
    message: "New internal web tools default to the Next.js + Railway golden path.",
  },
  {
    id: "rule-pii-payments",
    matches: ["pii", "payment", "card", "pci", "personal", "gdpr"],
    stakes: "high",
    recommend: { type: "text", text: "Security review required" },
    message:
      "Touches PII or payments — hard gate. Security review and admin sign-off required before build.",
  },
  {
    id: "rule-bookings",
    matches: ["booking", "order", "inventory", "reservation"],
    recommend: { type: "buildingBlock", buildingBlockId: "bookings-api" },
    stakes: "low",
    message: "Booking data should flow through the Bookings API — don't fork inventory logic.",
  },
  {
    id: "rule-scrape",
    matches: ["scrape", "crawl", "extract", "viator", "supplier"],
    recommend: { type: "buildingBlock", buildingBlockId: "scraper-service" },
    stakes: "low",
    message: "Use the managed Scraper service instead of one-off scripts on laptops.",
  },
];

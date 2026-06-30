import type { BuildingBlock, PmRecommendation, Tool } from "@/lib/types";

export type QuickReply = {
  id: string;
  label: string;
  variant?: "primary" | "secondary";
};

export type ChatAttachment =
  | { type: "matches"; tools: Tool[]; blocks: BuildingBlock[] }
  | { type: "pm-recommendation"; recommendation: PmRecommendation }
  | { type: "quick-replies"; replies: QuickReply[] }
  | { type: "risk-picker" }
  | {
      type: "register-cta";
      name: string;
      oneLiner: string;
      toolType: string;
      status: "planned" | "live";
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachment?: ChatAttachment;
};

export type DemoMode =
  | "live"
  | "exists"
  | "drop"
  | "scope"
  | "high-stakes";

export const DEMO_MODE_OPTIONS: {
  id: DemoMode;
  label: string;
  shortLabel: string;
}[] = [
  { id: "live", label: "Live (type your own)", shortLabel: "Live" },
  { id: "exists", label: "Exists → use it", shortLabel: "Exists" },
  { id: "drop", label: "Not worth it → drop", shortLabel: "Drop" },
  { id: "scope", label: "Scope & build", shortLabel: "Scope" },
  { id: "high-stakes", label: "High-stakes → loop in platform", shortLabel: "High-stakes" },
];

export const DEMO_STEP_DELAY_MS = 700;

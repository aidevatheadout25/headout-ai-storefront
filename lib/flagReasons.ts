import type { ToolFlagReasonCategory } from "@/lib/types";

export const TOOL_FLAG_REASON_CATEGORIES: ToolFlagReasonCategory[] = [
  "broken-link",
  "outdated",
  "wrong-owner",
  "duplicate",
  "security",
  "other",
];

export type FlagSuggestedAction = "deprecate" | "archive";

export function formatFlagReasonCategory(
  category: ToolFlagReasonCategory,
): string {
  switch (category) {
    case "broken-link":
      return "Broken link";
    case "outdated":
      return "Outdated";
    case "wrong-owner":
      return "Wrong or missing owner";
    case "duplicate":
      return "Duplicate";
    case "security":
      return "Security concern";
    case "other":
      return "Other";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function suggestedFlagAction(
  category: ToolFlagReasonCategory,
): FlagSuggestedAction | null {
  switch (category) {
    case "outdated":
      return "deprecate";
    case "broken-link":
    case "security":
      return "archive";
    case "wrong-owner":
    case "duplicate":
    case "other":
      return null;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function formatFlagSummary(
  category: ToolFlagReasonCategory,
  note?: string,
): string {
  const label = formatFlagReasonCategory(category);
  if (note?.trim()) {
    return `${label} — ${note.trim()}`;
  }
  return label;
}

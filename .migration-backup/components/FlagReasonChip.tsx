import type { ToolFlagReasonCategory } from "@/lib/types";
import { formatFlagReasonCategory } from "@/lib/flagReasons";

type FlagReasonChipProps = {
  category: ToolFlagReasonCategory;
};

export function FlagReasonChip({ category }: FlagReasonChipProps) {
  return (
    <span className="flag-reason-chip t-tag-sm" data-reason={category}>
      {formatFlagReasonCategory(category)}
    </span>
  );
}

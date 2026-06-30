import type { AccessLevel } from "@/lib/types";
import { formatAccessLevel } from "@/lib/toolMeta";

type AccessLevelBadgeProps = {
  level: AccessLevel;
  sensitive?: boolean;
};

export function AccessLevelBadge({ level, sensitive }: AccessLevelBadgeProps) {
  if (level === "open" && !sensitive) return null;

  return (
    <span
      className={`access-badge t-tag-sm access-badge--${level}${sensitive ? " access-badge--sensitive-flag" : ""}`}
    >
      {level === "sensitive" || sensitive ? "Sensitive" : formatAccessLevel(level)}
    </span>
  );
}

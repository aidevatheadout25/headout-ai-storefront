import type { CSSProperties } from "react";
import { formatToolType, type ToolType } from "@/lib/types";

const TYPE_TAG_STYLES: Record<
  ToolType,
  { bg: string; color: string; bgDark: string; colorDark: string }
> = {
  app: {
    bg: "var(--color-dreamypale-300)",
    color: "var(--color-dreamypale-800)",
    bgDark: "var(--color-dreamypale-800)",
    colorDark: "var(--color-dreamypale-400)",
  },
  skill: {
    bg: "var(--color-oceanblue-200)",
    color: "var(--color-oceanblue-800)",
    bgDark: "var(--color-oceanblue-900)",
    colorDark: "var(--color-oceanblue-300)",
  },
  docs: {
    bg: "var(--color-subtlegreen-200)",
    color: "var(--color-subtlegreen-800)",
    bgDark: "var(--color-subtlegreen-800)",
    colorDark: "var(--color-subtlegreen-300)",
  },
  mcp: {
    bg: "var(--color-peachyorange-200)",
    color: "var(--color-peachyorange-800)",
    bgDark: "var(--color-peachyorange-800)",
    colorDark: "var(--color-peachyorange-300)",
  },
  plugin: {
    bg: "var(--color-joymustard-200)",
    color: "var(--color-joymustard-800)",
    bgDark: "var(--color-joymustard-800)",
    colorDark: "var(--color-joymustard-300)",
  },
  script: {
    bg: "var(--color-peachyorange-300)",
    color: "var(--color-peachyorange-800)",
    bgDark: "var(--color-peachyorange-700)",
    colorDark: "var(--color-peachyorange-200)",
  },
  "slack-bot": {
    bg: "var(--color-candy-200)",
    color: "var(--color-candy-800)",
    bgDark: "var(--color-candy-800)",
    colorDark: "var(--color-candy-300)",
  },
  zep: {
    bg: "var(--color-purps-200)",
    color: "var(--color-purps-700)",
    bgDark: "var(--color-purps-900)",
    colorDark: "var(--color-purps-300)",
  },
};

type TypeTagProps = {
  type: ToolType;
};

export function TypeTag({ type }: TypeTagProps) {
  const styles = TYPE_TAG_STYLES[type];

  return (
    <span
      className="type-tag t-tag-rg"
      data-type={type}
      style={
        {
          "--type-tag-bg": styles.bg,
          "--type-tag-color": styles.color,
          "--type-tag-bg-dark": styles.bgDark,
          "--type-tag-color-dark": styles.colorDark,
        } as CSSProperties
      }
    >
      {formatToolType(type)}
    </span>
  );
}

import type { Tool, ToolType } from "@/lib/types";
import { compareLifecycle } from "@/lib/toolMeta";

export type RegistrySort = "most-used" | "recent" | "a-z";

function withLifecycleSort(tools: Tool[], secondary: (a: Tool, b: Tool) => number): Tool[] {
  return [...tools].sort((a, b) => {
    const lifecycleDiff = compareLifecycle(a, b);
    if (lifecycleDiff !== 0) return lifecycleDiff;
    return secondary(a, b);
  });
}

export function sortRegistryTools(tools: Tool[], sort: RegistrySort): Tool[] {
  switch (sort) {
    case "most-used":
      return withLifecycleSort(tools, (a, b) =>
        b.usageStats.views +
        b.usageStats.clicks -
        (a.usageStats.views + a.usageStats.clicks),
      );
    case "recent":
      return withLifecycleSort(tools, (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
      );
    case "a-z":
      return withLifecycleSort(tools, (a, b) => a.name.localeCompare(b.name));
    default: {
      const _exhaustive: never = sort;
      return _exhaustive;
    }
  }
}

export const TYPE_TAG_STYLES: Record<
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
  dashboard: {
    bg: "var(--color-subtlegreen-200)",
    color: "var(--color-subtlegreen-800)",
    bgDark: "var(--color-subtlegreen-800)",
    colorDark: "var(--color-subtlegreen-300)",
  },
};

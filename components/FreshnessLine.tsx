import type { Tool } from "@/lib/types";
import { formatRelativeDate, isStaleTool } from "@/lib/toolMeta";

type FreshnessLineProps = {
  tool: Tool;
  compact?: boolean;
};

export function FreshnessLine({ tool, compact = false }: FreshnessLineProps) {
  const stale = isStaleTool(tool);

  return (
    <div className={`freshness-line${compact ? " freshness-line--compact" : ""}`}>
      <span className="freshness-line__item t-label-sm">
        Updated {formatRelativeDate(tool.lastUpdated)}
      </span>
      {!compact && (
        <>
          <span className="freshness-line__sep" aria-hidden="true">
            ·
          </span>
          <span className="freshness-line__item t-label-sm">
            Last used {formatRelativeDate(tool.lastUsed)}
          </span>
        </>
      )}
      {stale && (
        <span className="stale-chip t-tag-sm" title="No recorded usage in 90+ days">
          Stale
        </span>
      )}
      {tool.linkUnreachable && (
        <span className="stale-chip stale-chip--error t-tag-sm" title="Link health check failed">
          Link unreachable
        </span>
      )}
    </div>
  );
}

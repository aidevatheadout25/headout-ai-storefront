import type { Tool } from "@/lib/types";
import { formatAccessLevel } from "@/lib/toolMeta";

type ToolFlagsProps = {
  tool: Tool;
};

export function ToolFlags({ tool }: ToolFlagsProps) {
  return (
    <div className="tool-flags">
      <span className={`tool-flag t-tag-sm tool-flag--${tool.accessLevel}`}>
        {formatAccessLevel(tool.accessLevel)}
      </span>
      {tool.writeCapable && (
        <span className="tool-flag tool-flag--write t-tag-sm">Write-capable</span>
      )}
      {tool.sensitive && tool.accessLevel !== "sensitive" && (
        <span className="tool-flag tool-flag--sensitive t-tag-sm">Sensitive data</span>
      )}
    </div>
  );
}

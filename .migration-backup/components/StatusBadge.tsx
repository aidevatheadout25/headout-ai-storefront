import type { CSSProperties } from "react";
import type { ToolLifecycleStatus } from "@/lib/types";
import {
  LIFECYCLE_STATUS_STYLES,
  formatLifecycleStatus,
} from "@/lib/toolMeta";

type StatusBadgeProps = {
  status: ToolLifecycleStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = LIFECYCLE_STATUS_STYLES[status];

  return (
    <span
      className="status-badge t-tag-sm"
      data-status={status}
      style={
        {
          "--status-bg": styles.bg,
          "--status-color": styles.color,
          "--status-bg-dark": styles.bgDark,
          "--status-color-dark": styles.colorDark,
        } as CSSProperties
      }
    >
      {formatLifecycleStatus(status)}
    </span>
  );
}

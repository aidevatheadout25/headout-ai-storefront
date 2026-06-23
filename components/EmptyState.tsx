import { Icon } from "@/components/Icon";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: "bulb" | "hourglass" | "globe" | "checkmark" | "shield-tick";
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  icon = "bulb",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon name={icon} size={32} />
      </div>
      <h2 className="empty-state__title t-heading-md">{title}</h2>
      <p className="empty-state__desc t-para-md">{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

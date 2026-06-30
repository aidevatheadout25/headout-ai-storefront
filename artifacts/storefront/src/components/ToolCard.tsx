import type { ReactNode } from "react";
import Link from "@/compat/next-link";
import { TypeTags } from "@/components/TypeTags";
import { StatusBadge } from "@/components/StatusBadge";
import { FreshnessLine } from "@/components/FreshnessLine";
import { AccessLevelBadge } from "@/components/AccessLevelBadge";
import { OwnerConfirmationChip } from "@/components/OwnerConfirmationChip";
import { Icon } from "@/components/Icon";
import type { Tool } from "@/lib/types";
import { canOpenToolLink } from "@/lib/toolMeta";

type ToolCardProps = {
  tool: Tool;
  variant?: "default" | "catalog";
};

/**
 * Card shell. When the tool is directly openable (live, open-access, safe
 * http(s) link) the whole card routes the user OUT to where the tool lives,
 * opening in a new tab. Otherwise — planned ideas, gated/sensitive access, or
 * tools without a usable link — it falls back to the internal detail page.
 */
function CardShell({
  openExternal,
  href,
  className,
  children,
}: {
  openExternal: boolean;
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (openExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function ToolCard({ tool, variant = "default" }: ToolCardProps) {
  const isPlanned = tool.status === "planned";
  const openExternal = canOpenToolLink(tool);
  const href = openExternal ? tool.link : `/tools/${tool.id}`;

  if (variant === "catalog") {
    return (
      <CardShell
        openExternal={openExternal}
        href={href}
        className="tool-card tool-card--catalog"
      >
        <div className="tool-card__header">
          <TypeTags types={tool.types} />
          <div className="tool-card__badges">
            <StatusBadge status={tool.status} />
            {!tool.ownerConfirmed && <OwnerConfirmationChip />}
            <AccessLevelBadge level={tool.accessLevel} sensitive={tool.sensitive} />
          </div>
        </div>
        <h3 className="tool-card__title t-heading-rg">{tool.name}</h3>
        <p className="tool-card__oneliner tool-card__oneliner--clamp t-para-rg">
          {tool.oneLiner}
        </p>
        <FreshnessLine tool={tool} compact />
        <div className="tool-card__footer tool-card__footer--row">
          <div className="tool-card__meta tool-card__meta--row">
            <span className="tool-card__owner t-label-sm">{tool.owner.name}</span>
            <span className="tool-card__meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="tool-card__team t-label-sm">{tool.team}</span>
          </div>
          <span className="tool-card__cta t-cta-sm">
            {isPlanned ? "View idea" : openExternal ? "Go to tool" : "View details"}
            <Icon name={openExternal ? "globe" : "arrow-right"} size={14} />
          </span>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell openExternal={openExternal} href={href} className="tool-card">
      <div className="tool-card__header">
        <TypeTags types={tool.types} />
        <div className="tool-card__badges">
          <StatusBadge status={tool.status} />
          {!tool.ownerConfirmed && <OwnerConfirmationChip />}
          <AccessLevelBadge level={tool.accessLevel} sensitive={tool.sensitive} />
        </div>
      </div>
      <h3 className="tool-card__title t-heading-rg">{tool.name}</h3>
      <p className="tool-card__oneliner t-para-rg">{tool.oneLiner}</p>
      <FreshnessLine tool={tool} compact />
      <div className="tool-card__footer">
        <div className="tool-card__meta">
          <span className="tool-card__owner t-label-sm">{tool.owner.name}</span>
          <span className="tool-card__team t-label-sm">{tool.team}</span>
        </div>
      </div>
    </CardShell>
  );
}

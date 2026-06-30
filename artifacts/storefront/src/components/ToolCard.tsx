import type { ReactNode } from "react";
import Link from "@/compat/next-link";
import { TypeTags } from "@/components/TypeTags";
import { StatusBadge } from "@/components/StatusBadge";
import { FreshnessLine } from "@/components/FreshnessLine";
import { AccessLevelBadge } from "@/components/AccessLevelBadge";
import { OwnerConfirmationChip } from "@/components/OwnerConfirmationChip";
import { Icon } from "@/components/Icon";
import type { Tool } from "@/lib/types";

type ToolCardProps = {
  tool: Tool;
  variant?: "default" | "catalog";
  /**
   * When provided, clicking the card calls this instead of navigating — used in
   * the chat to open the detail as an overlay so the conversation stays put.
   */
  onSelect?: (tool: Tool) => void;
};

/**
 * Card shell. A card click never routes straight to the external tool: it opens
 * the tool's detail view. When `onSelect` is supplied (chat) the card is a
 * button that opens the detail overlay; otherwise it links to the `/tools/:id`
 * detail page. The single outbound "Open tool" action lives on the detail view.
 */
function CardShell({
  onSelect,
  href,
  className,
  children,
}: {
  onSelect?: () => void;
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (onSelect) {
    return (
      <button type="button" className={`${className} tool-card--button`} onClick={onSelect}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function ToolCard({ tool, variant = "default", onSelect }: ToolCardProps) {
  const isPlanned = tool.status === "planned";
  const href = `/tools/${tool.id}`;
  const handleSelect = onSelect ? () => onSelect(tool) : undefined;

  if (variant === "catalog") {
    return (
      <CardShell
        onSelect={handleSelect}
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
            {isPlanned ? "View idea" : "View details"}
            <Icon name="arrow-right" size={14} />
          </span>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell onSelect={handleSelect} href={href} className="tool-card">
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

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

export function ToolCard({ tool, variant = "default" }: ToolCardProps) {
  const isPlanned = tool.status === "planned";
  const showGoToTool = canOpenToolLink(tool);

  if (variant === "catalog") {
    return (
      <Link href={`/tools/${tool.id}`} className="tool-card tool-card--catalog">
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
            {isPlanned ? "View idea" : showGoToTool ? "Go to tool" : "View details"}
            <Icon name="arrow-right" size={14} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/tools/${tool.id}`} className="tool-card">
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
    </Link>
  );
}

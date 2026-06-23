import Link from "next/link";
import type { BuildingBlock } from "@/lib/types";
import { formatBuildingBlockKind } from "@/lib/types";

type BuildingBlockCardProps = {
  block: BuildingBlock;
  compact?: boolean;
};

export function BuildingBlockCard({ block, compact }: BuildingBlockCardProps) {
  return (
    <div className={`building-block-card tool-card${compact ? " building-block-card--compact" : ""}`}>
      <div className="building-block-card__header">
        <span className="building-block-card__kind t-tag-sm">
          {formatBuildingBlockKind(block.kind)}
        </span>
        <span className="building-block-card__status t-tag-sm">{block.status}</span>
      </div>
      <h3 className="building-block-card__title t-heading-rg">{block.name}</h3>
      {!compact && (
        <p className="building-block-card__desc t-para-rg">{block.description}</p>
      )}
      <div className="building-block-card__tags">
        {block.capabilityTags.slice(0, compact ? 3 : 5).map((tag) => (
          <span key={tag} className="tag-chip t-tag-rg">
            {tag}
          </span>
        ))}
      </div>
      <p className="building-block-card__owner t-para-sm text-muted">
        {block.owner.name} ({block.owner.slackId})
      </p>
      {!compact && (
        <Link href={`/registry?tab=blocks&q=${encodeURIComponent(block.name)}`} className="text-link t-cta-sm">
          View in registry
        </Link>
      )}
    </div>
  );
}

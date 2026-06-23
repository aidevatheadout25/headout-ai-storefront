import Link from "next/link";
import { TypeTag } from "@/components/TypeTag";
import { Icon } from "@/components/Icon";
import type { Tool } from "@/lib/types";

type ToolCardProps = {
  tool: Tool;
  variant?: "default" | "catalog";
};

export function ToolCard({ tool, variant = "default" }: ToolCardProps) {
  if (variant === "catalog") {
    return (
      <Link href={`/tools/${tool.id}`} className="tool-card tool-card--catalog">
        <div className="tool-card__header">
          <TypeTag type={tool.type} />
          {tool.accessLevel === "gated" && (
            <span className="tool-card__gated t-tag-sm">Access gated</span>
          )}
        </div>
        <h3 className="tool-card__title t-heading-rg">{tool.name}</h3>
        <p className="tool-card__oneliner tool-card__oneliner--clamp t-para-rg">
          {tool.oneLiner}
        </p>
        <div className="tool-card__footer tool-card__footer--row">
          <div className="tool-card__meta tool-card__meta--row">
            <span className="tool-card__owner t-label-sm">{tool.owner.name}</span>
            <span className="tool-card__meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="tool-card__team t-label-sm">{tool.team}</span>
          </div>
          <span className="tool-card__cta t-cta-sm">
            Go to tool
            <Icon name="arrow-right" size={14} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/tools/${tool.id}`} className="tool-card">
      <div className="tool-card__header">
        <TypeTag type={tool.type} />
        {tool.accessLevel === "gated" && (
          <span className="tool-card__gated t-tag-sm">Access gated</span>
        )}
      </div>
      <h3 className="tool-card__title t-heading-rg">{tool.name}</h3>
      <p className="tool-card__oneliner t-para-rg">{tool.oneLiner}</p>
      <div className="tool-card__footer">
        <div className="tool-card__meta">
          <span className="tool-card__owner t-label-sm">{tool.owner.name}</span>
          <span className="tool-card__team t-label-sm">{tool.team}</span>
        </div>
      </div>
    </Link>
  );
}

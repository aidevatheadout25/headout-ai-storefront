import { useState } from "react";
import { TypeTags } from "@/components/TypeTags";
import { StatusBadge } from "@/components/StatusBadge";
import { FreshnessLine } from "@/components/FreshnessLine";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolManagePanel } from "@/components/ToolManagePanel";
import { canOpenToolLink, formatVisibility, isSafeToolLink } from "@/lib/toolMeta";
import { buildZepsBuilderUrl } from "@/lib/zeps";
import type { Tool } from "@/lib/types";

type ToolDetailContentProps = {
  tool: Tool;
  /** Called after an owner/admin edit so the parent can refresh its copy. */
  onUpdated: (tool: Tool) => void;
};

/**
 * The full tool record — shown identically on the `/tools/:id` page and in the
 * chat detail overlay (both read from the same get-by-id data). The single
 * outbound action is the primary "Open tool" button; the link is otherwise
 * shown as plain text, never as a click-through.
 */
export function ToolDetailContent({ tool, onUpdated }: ToolDetailContentProps) {
  const [managing, setManaging] = useState(false);

  const isPlanned = tool.status === "planned";
  const isDeprecated = tool.status === "deprecated";
  const isArchived = tool.status === "archived";
  const isOpen = tool.accessLevel === "open";
  const showOpenTool = canOpenToolLink(tool);

  return (
    <>
      <header className="tool-detail__header">
        <div className="tool-detail__tags">
          <TypeTags types={tool.types} />
          <StatusBadge status={tool.status} />
          <span className="tool-detail__team t-tag-rg">{tool.team}</span>
        </div>
        <h1 className="tool-detail__title t-display-xs">{tool.name}</h1>
        <p className="tool-detail__oneliner t-para-lg">{tool.oneLiner}</p>
        <FreshnessLine tool={tool} />
        {!managing && (
          <button
            type="button"
            className="tool-detail__manage t-para-sm text-link"
            onClick={() => setManaging(true)}
          >
            <Icon name="shield-tick" size={16} />
            {tool.claimed ? "Manage this listing" : "Claim & manage this listing"}
          </button>
        )}
      </header>

      {managing && (
        <ToolManagePanel
          tool={tool}
          onUpdated={(updated) => onUpdated(updated)}
          onClose={() => setManaging(false)}
        />
      )}

      <div className="tool-detail__grid">
        <div className="tool-detail__main">
          <section className="detail-section">
            <h2 className="detail-section__title t-heading-md">Description</h2>
            <p className="t-para-md">{tool.description}</p>
          </section>

          {tool.tags.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section__title t-heading-md">Tags</h2>
              <div className="tag-list">
                {tool.tags.map((tag) => (
                  <span key={tag} className="tag-chip t-tag-rg">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {tool.link && isSafeToolLink(tool.link) && (
            <section className="detail-section">
              <h2 className="detail-section__title t-heading-md">Where it lives</h2>
              <p className="tool-detail__where t-para-rg">{tool.link}</p>
            </section>
          )}

          {isPlanned && (
            <section className="detail-section detail-section--planned">
              <div className="planned-callout">
                <Icon name="bulb" size={24} />
                <div>
                  <h2 className="planned-callout__title t-heading-sm">
                    Registered idea
                  </h2>
                  <p className="planned-callout__desc t-para-rg">
                    This is a planned capability — not built yet. Reach out to{" "}
                    <strong>{tool.owner.name}</strong> ({tool.owner.slackId})
                    before building something similar.
                  </p>
                </div>
              </div>
            </section>
          )}

          {isDeprecated && (
            <section className="detail-section">
              <div className="deprecated-callout">
                <Icon name="info-circle" size={24} />
                <div>
                  <h2 className="deprecated-callout__title t-heading-sm">
                    Deprecated
                  </h2>
                  <p className="deprecated-callout__desc t-para-rg">
                    Still works, but prefer a newer tool.
                  </p>
                </div>
              </div>
            </section>
          )}

          {isArchived && (
            <section className="detail-section">
              <div className="archived-callout">
                <Icon name="hourglass" size={24} />
                <div>
                  <h2 className="archived-callout__title t-heading-sm">
                    Archived
                  </h2>
                  <p className="archived-callout__desc t-para-rg">
                    Retired — not for active use. Kept for history and dedup.
                  </p>
                </div>
              </div>
            </section>
          )}

          {!isOpen && !isPlanned && (
            <section className="detail-section detail-section--gated">
              <div className="gated-callout">
                <Icon name="shield-tick" size={24} />
                <div>
                  <h2 className="gated-callout__title t-heading-sm">
                    {tool.accessLevel === "sensitive"
                      ? "Sensitive access"
                      : "Request access required"}
                  </h2>
                  <p className="gated-callout__desc t-para-rg">
                    This tool stays visible in the catalogue — only the link is
                    gated. Storefront never holds credentials or grants access.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="tool-detail__sidebar">
          <div className="sidebar-card">
            {showOpenTool ? (
              <ButtonLink href={tool.link} variant="primary" size="rg" external>
                Open tool
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
            ) : isPlanned ? (
              <div className="build-with-zeps">
                <ButtonLink
                  href={buildZepsBuilderUrl({
                    name: tool.name,
                    prompt: tool.oneLiner,
                    source: `storefront:${tool.id}`,
                  })}
                  variant="primary"
                  size="rg"
                  external
                >
                  Build with Zeps
                  <Icon name="arrow-right" size={18} />
                </ButtonLink>
                <p className="sidebar-card__note t-para-sm text-muted">
                  No engineer needed — Zeps builds it in a chat. When it&apos;s
                  done, paste the link back to list it as a live Zep.
                </p>
              </div>
            ) : (
              <p className="sidebar-card__note t-para-rg text-muted">
                Access is gated — contact the owner on Slack to get set up.
                Storefront doesn&apos;t grant access.
              </p>
            )}

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">Owner</span>
              <p className="t-para-rg">{tool.owner.name}</p>
              <p className="t-para-sm text-muted">{tool.owner.slackId}</p>
            </div>

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">Team</span>
              <p className="t-para-rg">{tool.team}</p>
            </div>

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">
                Visibility
              </span>
              <p className="t-para-rg">{formatVisibility(tool.visibility)}</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

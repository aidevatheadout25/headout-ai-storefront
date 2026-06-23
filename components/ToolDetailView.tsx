"use client";

import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { TypeTag } from "@/components/TypeTag";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";
import { useState } from "react";

export function ToolDetailView() {
  const params = useParams();
  const id = params.id as string;
  const { getToolById, markHelpful, recordClick, canEditTool } = useApp();
  const tool = getToolById(id);
  const [helpfulClicked, setHelpfulClicked] = useState(false);

  if (!tool || tool.status !== "approved") {
    notFound();
  }

  const approvedTool = tool;

  function handleGoToTool() {
    recordClick(approvedTool.id);
    window.open(approvedTool.link, "_blank", "noopener,noreferrer");
  }

  function handleHelpful() {
    if (!helpfulClicked) {
      markHelpful(approvedTool.id);
      setHelpfulClicked(true);
    }
  }

  return (
    <article className="tool-detail">
      <Link href="/registry" className="tool-detail__back t-para-rg text-link">
        <Icon name="chevron-right" size={16} style={{ transform: "rotate(180deg)" }} />
        Back to registry
      </Link>

      <header className="tool-detail__header">
        <div className="tool-detail__tags">
          <TypeTag type={approvedTool.type} />
          <span className="tool-detail__team t-tag-rg">{approvedTool.team}</span>
        </div>
        <h1 className="tool-detail__title t-display-xs">{approvedTool.name}</h1>
        <p className="tool-detail__oneliner t-para-lg">{approvedTool.oneLiner}</p>
      </header>

      <div className="tool-detail__grid">
        <div className="tool-detail__main">
          <section className="detail-section">
            <h2 className="detail-section__title t-heading-md">Description</h2>
            <p className="t-para-md">{approvedTool.description}</p>
          </section>

          {approvedTool.tags.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section__title t-heading-md">Tags</h2>
              <div className="tag-list">
                {approvedTool.tags.map((tag) => (
                  <span key={tag} className="tag-chip t-tag-rg">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {approvedTool.accessLevel === "gated" && (
            <section className="detail-section detail-section--gated">
              <div className="gated-callout">
                <Icon name="shield-tick" size={24} />
                <div>
                  <h2 className="gated-callout__title t-heading-sm">
                    Access gated
                  </h2>
                  <p className="gated-callout__desc t-para-rg">
                    This tool requires approval. Reach out on Slack:{" "}
                    <strong>{approvedTool.accessContact ?? approvedTool.owner.slackId}</strong>
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="tool-detail__sidebar">
          <div className="sidebar-card">
            <Button variant="primary" size="rg" onClick={handleGoToTool}>
              Go to tool
              <Icon name="arrow-right" size={18} />
            </Button>

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">Owner</span>
              <p className="t-para-rg">{approvedTool.owner.name}</p>
              <p className="t-para-sm text-muted">{approvedTool.owner.slackId}</p>
            </div>

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">
                Usage stats
              </span>
              <ul className="stats-list">
                <li className="t-para-rg">
                  <span>{approvedTool.usageStats.views}</span> views
                </li>
                <li className="t-para-rg">
                  <span>{approvedTool.usageStats.clicks}</span> outbound clicks
                </li>
                <li className="t-para-rg">
                  <span>{approvedTool.usageStats.helpful}</span> marked helpful
                </li>
              </ul>
            </div>

            <div className="sidebar-card__actions">
              <button
                type="button"
                className={`helpful-btn t-cta-sm${helpfulClicked ? " helpful-btn--active" : ""}`}
                onClick={handleHelpful}
                disabled={helpfulClicked}
              >
                <Icon name="checkmark" size={16} />
                {helpfulClicked ? "Marked helpful" : "Helpful"}
              </button>
              <a
                href={`mailto:${approvedTool.owner.slackId}?subject=Improvement request: ${approvedTool.name}`}
                className="improvement-link t-para-rg text-link"
              >
                Request an improvement
              </a>
            </div>

            {canEditTool(approvedTool) && (
              <ButtonLink href={`/edit/${approvedTool.id}`} variant="tertiary" size="sm">
                Edit this tool
              </ButtonLink>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

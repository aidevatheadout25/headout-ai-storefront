"use client";

import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { SubmissionStatusBadge } from "@/components/SubmissionStatusBadge";
import { TypeTags } from "@/components/TypeTags";
import { ButtonLink } from "@/components/Button";
import { RoleBanner } from "@/components/RoleSwitcher";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";

export function MySubmissionsView() {
  const { mySubmissions } = useApp();

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">My submissions</h1>
          <p className="page-header__desc t-para-md">
            Track what you&apos;ve registered — pending review, live in the
            catalog, or sent back with feedback.
          </p>
        </div>
        <ButtonLink href="/submit" variant="primary">
          Submit a tool
        </ButtonLink>
      </div>

      {mySubmissions.length === 0 ? (
        <EmptyState
          icon="bulb"
          title="No submissions yet"
          description="Register an idea or tool — you'll see its status here after you submit."
          action={
            <ButtonLink href="/submit" variant="primary">
              Submit a tool
            </ButtonLink>
          }
        />
      ) : (
        <ul className="submission-list">
          {mySubmissions.map((tool) => (
            <li key={tool.id} className="submission-card tool-card">
              <div className="submission-card__header">
                <TypeTags types={tool.types} />
                <SubmissionStatusBadge tool={tool} />
              </div>
              <Link href={`/tools/${tool.id}`} className="submission-card__title t-heading-rg text-link">
                {tool.name}
              </Link>
              <p className="submission-card__oneliner t-para-rg">{tool.oneLiner}</p>
              <p className="submission-card__meta t-para-sm text-muted">
                Updated {new Date(tool.lastUpdated).toLocaleDateString()}
              </p>

              {tool.approvalStatus === "rejected" && tool.rejectReason && (
                <div className="submission-card__rejection">
                  <Icon name="info-circle" size={16} />
                  <div>
                    <p className="t-label-sm">Rejected — admin feedback</p>
                    <p className="t-para-rg">{tool.rejectReason}</p>
                  </div>
                </div>
              )}

              <div className="submission-card__actions">
                <Link href={`/tools/${tool.id}`} className="t-cta-sm text-link">
                  View details
                  <Icon name="arrow-right" size={14} />
                </Link>
                {tool.approvalStatus === "rejected" && (
                  <ButtonLink href={`/edit/${tool.id}`} variant="secondary" size="sm">
                    Edit and resubmit
                  </ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

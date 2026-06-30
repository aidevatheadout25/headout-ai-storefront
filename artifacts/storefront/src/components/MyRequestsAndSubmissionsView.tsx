
import Link from "@/compat/next-link";
import { EmptyState } from "@/components/EmptyState";
import { SubmissionStatusBadge } from "@/components/SubmissionStatusBadge";
import { TypeTags } from "@/components/TypeTags";
import { ButtonLink } from "@/components/Button";
import { RoleBanner } from "@/components/RoleSwitcher";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";
import { formatSubmissionDate } from "@/lib/toolMeta";

export function MyRequestsAndSubmissionsView() {
  const { mySubmissions } = useApp();

  const isEmpty = mySubmissions.length === 0;

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">My activity</h1>
          <p className="page-header__desc t-para-md">
            Tools you registered in the catalogue — pending approval through to
            live.
          </p>
        </div>
        <div className="page-header__actions">
          <ButtonLink href="/" variant="secondary">
            Open chat
          </ButtonLink>
          <ButtonLink href="/submit" variant="primary">
            Register a tool
          </ButtonLink>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon="bulb"
          title="Nothing registered yet"
          description="Scope an idea in chat, build it, then register it here when it's ready."
          action={
            <ButtonLink href="/" variant="primary">
              Open chat
            </ButtonLink>
          }
        />
      ) : (
        <section className="tracking-section">
          <h2 className="tracking-section__title t-heading-sm">My submissions</h2>
          <ul className="submission-list">
            {mySubmissions.map((tool) => (
              <li key={tool.id} className="submission-card tool-card">
                <div className="submission-card__header">
                  <TypeTags types={tool.types} />
                  <SubmissionStatusBadge tool={tool} />
                </div>
                <Link
                  href={`/tools/${tool.id}`}
                  className="submission-card__title t-heading-rg text-link"
                >
                  {tool.name}
                </Link>
                <p className="submission-card__oneliner t-para-rg">{tool.oneLiner}</p>
                <p className="submission-card__meta t-para-sm text-muted">
                  Updated {formatSubmissionDate(tool.lastUpdated)}
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
                  {tool.approvalStatus === "pending" && (
                    <ButtonLink href={`/edit/${tool.id}`} variant="secondary" size="sm">
                      Edit submission
                    </ButtonLink>
                  )}
                  {tool.approvalStatus === "rejected" && (
                    <ButtonLink href={`/edit/${tool.id}`} variant="secondary" size="sm">
                      Edit and resubmit
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { SubmissionStatusBadge } from "@/components/SubmissionStatusBadge";
import { RequestStatusBadge } from "@/components/RequestStatusBadge";
import { TypeTags } from "@/components/TypeTags";
import { Button, ButtonLink } from "@/components/Button";
import { RoleBanner } from "@/components/RoleSwitcher";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";
import { formatSubmissionDate } from "@/lib/toolMeta";

export function MyRequestsAndSubmissionsView() {
  const {
    myRequests,
    mySubmissions,
    canSubmitTool,
    canFileRequest,
    getToolById,
    role,
    requestBuilderAccess,
    hasPendingBuilderAccessRequest,
  } = useApp();

  const isEmpty = myRequests.length === 0 && mySubmissions.length === 0;

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">
            My requests & submissions
          </h1>
          <p className="page-header__desc t-para-md">
            Track needs you filed and tools you registered — from open demand to
            live in the catalog.
          </p>
        </div>
        <div className="page-header__actions">
          {canFileRequest && (
            <ButtonLink href="/file-need" variant="secondary">
              File a need
            </ButtonLink>
          )}
          {canSubmitTool && (
            <ButtonLink href="/submit" variant="primary">
              Submit a tool
            </ButtonLink>
          )}
        </div>
      </div>

      {role === "viewer" && (
        <div className="builder-access-strip">
          <p className="builder-access-strip__text t-para-rg">
            Want to register tools or claim requests? Builder access is granted
            by an admin.
          </p>
          {hasPendingBuilderAccessRequest ? (
            <p className="builder-access-strip__status t-para-sm text-muted" role="status">
              Builder access requested — waiting on admin.
            </p>
          ) : (
            <Button variant="secondary" size="sm" onClick={requestBuilderAccess}>
              Request builder access
            </Button>
          )}
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon="bulb"
          title="Nothing to track yet"
          description="File a need when something's missing, or submit a tool once you're a builder."
          action={
            <ButtonLink href="/file-need" variant="primary">
              File a need
            </ButtonLink>
          }
        />
      ) : (
        <>
          {myRequests.length > 0 && (
            <section className="tracking-section">
              <h2 className="tracking-section__title t-heading-sm">My requests</h2>
              <ul className="submission-list">
                {myRequests.map((request) => {
                  const linkedTool = request.linkedToolId
                    ? getToolById(request.linkedToolId)
                    : undefined;

                  return (
                    <li key={request.id} className="submission-card tool-card">
                      <div className="submission-card__header">
                        <RequestStatusBadge status={request.status} />
                        <span className="submission-card__team t-tag-rg">
                          {request.team}
                        </span>
                      </div>
                      <Link
                        href={`/requests#${request.id}`}
                        className="submission-card__title t-heading-rg text-link"
                      >
                        {request.title}
                      </Link>
                      <p className="submission-card__oneliner t-para-rg">
                        {request.problem}
                      </p>
                      <p className="submission-card__meta t-para-sm text-muted">
                        Filed {formatSubmissionDate(request.createdAt)}
                        {" · "}
                        {request.upvotes} upvote{request.upvotes === 1 ? "" : "s"}
                      </p>

                      {request.status === "claimed" && request.claimedBy && (
                        <p className="submission-card__status t-para-rg">
                          Claimed by <strong>{request.claimedBy.name}</strong>
                          {linkedTool && (
                            <>
                              {" "}
                              →{" "}
                              <Link
                                href={`/tools/${linkedTool.id}`}
                                className="text-link"
                              >
                                {linkedTool.name}
                              </Link>
                            </>
                          )}
                        </p>
                      )}

                      {request.status === "fulfilled" && request.claimedBy && linkedTool && (
                        <p className="submission-card__status t-para-rg">
                          Built by <strong>{request.claimedBy.name}</strong> →{" "}
                          <Link href={`/tools/${linkedTool.id}`} className="text-link">
                            {linkedTool.name}
                          </Link>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {mySubmissions.length > 0 && (
            <section className="tracking-section">
              <h2 className="tracking-section__title t-heading-sm">My tool submissions</h2>
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
      )}
    </>
  );
}

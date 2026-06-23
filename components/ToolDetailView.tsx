"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { TypeTags } from "@/components/TypeTags";
import { StatusBadge } from "@/components/StatusBadge";
import { FreshnessLine } from "@/components/FreshnessLine";
import { ToolFlags } from "@/components/ToolFlags";
import { OwnerConfirmationChip } from "@/components/OwnerConfirmationChip";
import { SubmissionStatusBadge } from "@/components/SubmissionStatusBadge";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";
import { MOCK_OWNERS } from "@/lib/mockData";
import {
  canOpenToolLink,
  isCurrentUserOwner,
  isIdeaSubmission,
  passesLightApprovalCheck,
} from "@/lib/toolMeta";
import { GATE_ELIGIBILITY_NOTE } from "@/lib/adminMetrics";
import type { Owner, Tool } from "@/lib/types";

export function ToolDetailView() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const {
    getToolById,
    canViewTool,
    canApprove,
    canEditTool,
    canManageTool,
    markHelpful,
    recordClick,
    requestAccess,
    accessRequests,
    flagTool,
    confirmOwnership,
    transferOwnership,
    archiveTool,
    approveTool,
    rejectTool,
    currentUser,
  } = useApp();
  const rawTool = getToolById(id);
  const [helpfulClicked, setHelpfulClicked] = useState(false);
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (!rawTool || !canViewTool(rawTool)) {
    notFound();
  }

  const tool: Tool = rawTool;
  const isApproved = tool.approvalStatus === "approved";
  const isPending = tool.approvalStatus === "pending";
  const isRejected = tool.approvalStatus === "rejected";
  const isSubmitter = tool.submittedBy === currentUser.id;
  const isOpen = tool.accessLevel === "open";
  const accessAlreadyRequested = accessRequests.includes(tool.id);
  const isPlanned = tool.status === "planned";
  const isArchived = tool.status === "archived";
  const showGoToTool = isApproved && canOpenToolLink(tool);
  const showOwnerConfirm =
    isApproved &&
    !tool.ownerConfirmed &&
    isCurrentUserOwner(tool, currentUser.slackId);
  const canManage = canManageTool(tool);
  const checksPass = passesLightApprovalCheck(tool);
  const isIdea = isIdeaSubmission(tool);

  function handleGoToTool() {
    recordClick(tool.id);
    window.open(tool.link, "_blank", "noopener,noreferrer");
  }

  function handleRequestAccess() {
    requestAccess(tool.id);
    setAccessConfirmed(true);
  }

  function handleHelpful() {
    if (!helpfulClicked) {
      markHelpful(tool.id);
      setHelpfulClicked(true);
    }
  }

  function handleFlagSubmit() {
    if (!flagReason.trim()) return;
    flagTool(tool.id, flagReason.trim());
    setFlagSubmitted(true);
    setFlagOpen(false);
    setFlagReason("");
  }

  function handleTransfer() {
    const owner = MOCK_OWNERS.find((o) => o.slackId === selectedOwner);
    if (!owner) return;
    transferOwnership(tool.id, owner as Owner);
    setTransferOpen(false);
    setSelectedOwner("");
  }

  function handleArchive() {
    archiveTool(tool.id);
    setArchiveConfirm(false);
  }

  function handleApprove() {
    approveTool(tool.id);
    router.push("/admin/approvals");
  }

  function handleReject() {
    if (!rejectReason.trim()) return;
    rejectTool(tool.id, rejectReason);
    setRejecting(false);
    setRejectReason("");
    router.push(isSubmitter ? "/my-submissions" : "/admin/approvals");
  }

  const backHref = isSubmitter && !isApproved ? "/my-submissions" : "/registry";
  const backLabel =
    isSubmitter && !isApproved ? "Back to my submissions" : "Back to registry";

  return (
    <article className="tool-detail">
      <Link href={backHref} className="tool-detail__back t-para-rg text-link">
        <Icon name="chevron-right" size={16} style={{ transform: "rotate(180deg)" }} />
        {backLabel}
      </Link>

      {isPending && (
        <div className="review-banner review-banner--pending" role="status">
          <Icon name="hourglass" size={20} />
          <div className="review-banner__content">
            <p className="review-banner__title t-subheading-rg">Pending review</p>
            <p className="review-banner__desc t-para-sm">
              {isSubmitter
                ? "Your submission is in the admin queue — you'll see it here until it's approved or rejected."
                : "This submission is awaiting admin review before it goes live in the catalog."}
            </p>
            {canApprove && (
              <div className="review-banner__actions">
                {rejecting ? (
                  <div className="review-banner__reject-form">
                    <textarea
                      className="form-field__input form-field__textarea t-para-rg"
                      rows={3}
                      placeholder="Reason for rejection (required — sent to submitter)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="review-banner__action-row">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleReject}
                        disabled={!rejectReason.trim()}
                      >
                        Confirm reject
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRejecting(false);
                          setRejectReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="review-banner__action-row">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApprove}
                      disabled={!checksPass}
                    >
                      {isIdea ? "Publish idea" : "Approve & go live"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}>
                      Reject (with reason)
                    </Button>
                  </div>
                )}
                {!isIdea && (
                  <p className="gate-eligibility-note t-para-sm text-muted">
                    {GATE_ELIGIBILITY_NOTE}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isRejected && (
        <div className="review-banner review-banner--rejected" role="alert">
          <Icon name="info-circle" size={20} />
          <div className="review-banner__content">
            <p className="review-banner__title t-subheading-rg">Rejected</p>
            {tool.rejectReason && (
              <p className="review-banner__desc t-para-rg">{tool.rejectReason}</p>
            )}
            {isSubmitter && (
              <ButtonLink href={`/edit/${tool.id}`} variant="primary" size="sm">
                Edit and resubmit
              </ButtonLink>
            )}
          </div>
        </div>
      )}

      <header className="tool-detail__header">
        <div className="tool-detail__tags">
          <TypeTags types={tool.types} />
          {isApproved ? (
            <StatusBadge status={tool.status} />
          ) : (
            <SubmissionStatusBadge tool={tool} />
          )}
          {isApproved && !tool.ownerConfirmed && <OwnerConfirmationChip />}
          <span className="tool-detail__team t-tag-rg">{tool.team}</span>
        </div>
        {isApproved && <ToolFlags tool={tool} />}
        <h1 className="tool-detail__title t-display-xs">{tool.name}</h1>
        <p className="tool-detail__oneliner t-para-lg">{tool.oneLiner}</p>
        <FreshnessLine tool={tool} />

        {isApproved && (
          <div className="tool-detail__toolbar">
            <button
              type="button"
              className="tool-detail__flag-btn t-cta-sm"
              onClick={() => setFlagOpen(true)}
              aria-label="Flag this entry"
            >
              <Icon name="info-circle" size={16} />
              Flag
            </button>
          </div>
        )}

        {flagSubmitted && (
          <p className="tool-detail__flag-confirmation t-para-sm" role="status">
            Flagged for admin review.
          </p>
        )}
      </header>

      {flagOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFlagOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="flag-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="flag-dialog-title" className="modal-card__title t-heading-sm">
              Flag this entry
            </h2>
            <p className="modal-card__desc t-para-sm text-muted">
              Tell admins what&apos;s wrong — outdated info, broken link, etc.
            </p>
            <textarea
              className="form-field__input form-field__textarea t-para-rg"
              rows={3}
              placeholder="Reason for flagging"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              autoFocus
            />
            <div className="modal-card__actions">
              <Button
                variant="primary"
                size="sm"
                onClick={handleFlagSubmit}
                disabled={!flagReason.trim()}
              >
                Submit flag
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setFlagOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {transferOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setTransferOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="transfer-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="transfer-dialog-title" className="modal-card__title t-heading-sm">
              Transfer ownership
            </h2>
            <p className="modal-card__desc t-para-sm text-muted">
              Pick a new owner — they&apos;ll be notified on Slack (mocked).
            </p>
            <select
              className="form-field__input form-field__select t-para-rg"
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
            >
              <option value="">Select owner</option>
              {MOCK_OWNERS.filter((o) => o.slackId !== tool.owner.slackId).map((o) => (
                <option key={o.slackId} value={o.slackId}>
                  {o.name} ({o.slackId})
                </option>
              ))}
            </select>
            <div className="modal-card__actions">
              <Button
                variant="primary"
                size="sm"
                onClick={handleTransfer}
                disabled={!selectedOwner}
              >
                Transfer
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="tool-detail__grid">
        <div className="tool-detail__main">
          {tool.ownerInstructions && (
            <section className="detail-section detail-section--instructions">
              <h2 className="detail-section__title t-heading-md">
                How to use / how to get access
              </h2>
              <p className="owner-instructions t-para-md">{tool.ownerInstructions}</p>
            </section>
          )}

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

          {tool.link && (
            <section className="detail-section">
              <h2 className="detail-section__title t-heading-md">Link</h2>
              <a
                href={tool.link}
                className="t-para-rg text-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tool.link}
              </a>
            </section>
          )}

          {isPlanned && isApproved && (
            <section className="detail-section detail-section--planned">
              <div className="planned-callout">
                <Icon name="bulb" size={24} />
                <div>
                  <h2 className="planned-callout__title t-heading-sm">Registered idea</h2>
                  <p className="planned-callout__desc t-para-rg">
                    This is a planned capability — not built yet. Reach out to{" "}
                    <strong>{tool.owner.name}</strong> ({tool.owner.slackId}) before
                    building something similar.
                  </p>
                </div>
              </div>
            </section>
          )}

          {isArchived && (
            <section className="detail-section">
              <div className="archived-callout">
                <Icon name="hourglass" size={24} />
                <p className="t-para-rg">
                  This tool is archived — still searchable but ranked last. Contact the
                  owner if you need a replacement.
                </p>
              </div>
            </section>
          )}

          {isApproved && !isOpen && (
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
                    This tool stays visible in search — only the link is gated.
                    Storefront never holds credentials or grants access.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="tool-detail__sidebar">
          <div className="sidebar-card">
            {isApproved && showGoToTool ? (
              <Button variant="primary" size="rg" onClick={handleGoToTool}>
                Go to tool
                <Icon name="arrow-right" size={18} />
              </Button>
            ) : isApproved && !isOpen ? (
              <div className="access-request">
                {accessConfirmed || accessAlreadyRequested ? (
                  <div className="access-request__confirmation">
                    <Icon name="checkmark" size={24} />
                    <p className="t-para-rg">
                      Request sent to the platform team /{" "}
                      <strong>{tool.owner.name}</strong>. Storefront doesn&apos;t grant
                      access — they&apos;ll follow up on Slack.
                    </p>
                  </div>
                ) : (
                  <Button variant="primary" size="rg" onClick={handleRequestAccess}>
                    Request access
                  </Button>
                )}
              </div>
            ) : isApproved && isPlanned ? (
              <p className="sidebar-card__note t-para-rg text-muted">
                No link yet — contact the owner to collaborate on this idea.
              </p>
            ) : isApproved && tool.linkUnreachable ? (
              <p className="sidebar-card__note t-para-rg text-muted">
                Link unreachable — contact the owner for an updated URL.
              </p>
            ) : isPending && isSubmitter ? (
              <p className="sidebar-card__note t-para-rg text-muted">
                Waiting on admin review — check{" "}
                <Link href="/my-submissions" className="text-link">
                  my submissions
                </Link>{" "}
                for status updates.
              </p>
            ) : null}

            <div className="sidebar-card__section">
              <span className="sidebar-card__label t-label-rg-heavy">Owner</span>
              <p className="t-para-rg">{tool.owner.name}</p>
              <p className="t-para-sm text-muted">{tool.owner.slackId}</p>
            </div>

            {showOwnerConfirm && (
              <div className="sidebar-card__section">
                <Button variant="primary" size="sm" onClick={() => confirmOwnership(tool.id)}>
                  Confirm ownership
                </Button>
                <p className="signal-microcopy t-para-sm text-muted">
                  You were listed as owner — confirm this entry is accurate.
                </p>
              </div>
            )}

            {isApproved && (
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
                <p className="signal-microcopy t-para-sm text-muted">
                  Lightweight signal only — no guaranteed response from the owner.
                </p>
                <a
                  href={`mailto:${tool.owner.slackId}?subject=Improvement request: ${tool.name}`}
                  className="improvement-link t-para-rg text-link"
                >
                  Request an improvement
                </a>
              </div>
            )}

            {isApproved && canEditTool(tool) && (
              <ButtonLink href={`/edit/${tool.id}`} variant="tertiary" size="sm">
                Edit this tool
              </ButtonLink>
            )}

            {canManage && !isArchived && (
              <div className="sidebar-card__manage">
                <button
                  type="button"
                  className="manage-action t-cta-sm"
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer ownership
                </button>
                {!archiveConfirm ? (
                  <button
                    type="button"
                    className="manage-action manage-action--destructive t-cta-sm"
                    onClick={() => setArchiveConfirm(true)}
                  >
                    Archive
                  </button>
                ) : (
                  <div className="archive-confirm">
                    <p className="t-para-sm">Archive this tool? It stays searchable.</p>
                    <div className="archive-confirm__actions">
                      <Button variant="destructive" size="sm" onClick={handleArchive}>
                        Confirm archive
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setArchiveConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

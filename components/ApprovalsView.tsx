"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TypeTags } from "@/components/TypeTags";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { Icon } from "@/components/Icon";
import { useApp } from "@/context/AppContext";
import { FlagReasonChip } from "@/components/FlagReasonChip";
import type { Tool, ToolFlag } from "@/lib/types";
import { formatToolTypes } from "@/lib/types";
import {
  formatAccessLevel,
  formatSubmissionDate,
  formatSubmitterLabel,
  isGoLiveSubmission,
  isIdeaSubmission,
  passesLightApprovalCheck,
  toolHasMcpType,
} from "@/lib/toolMeta";
import { GATE_ELIGIBILITY_NOTE } from "@/lib/adminMetrics";
import { suggestedFlagAction } from "@/lib/flagReasons";

function FlaggedCard({
  flag,
  onDismiss,
  onDeprecate,
  onArchive,
}: {
  flag: ToolFlag;
  onDismiss: () => void;
  onDeprecate: () => void;
  onArchive: () => void;
}) {
  const suggested = suggestedFlagAction(flag.reasonCategory);

  return (
    <li className="flagged-card">
      <div className="flagged-card__header">
        <Icon name="info-circle" size={18} className="flagged-card__icon" />
        <div className="flagged-card__main">
          <div className="flagged-card__title-row">
            <Link
              href={`/tools/${flag.toolId}`}
              className="flagged-card__title t-heading-sm text-link"
            >
              {flag.toolName}
            </Link>
            <FlagReasonChip category={flag.reasonCategory} />
          </div>
          {flag.note && (
            <p className="flagged-card__note t-para-rg">{flag.note}</p>
          )}
          <p className="flagged-card__meta t-para-sm text-muted">
            Reported by {flag.reporterName} ({flag.reporterSlackId})
          </p>
          {suggested === "deprecate" && (
            <p className="flagged-card__suggestion t-para-sm">
              Suggested: deprecate outdated tools that still work.
            </p>
          )}
          {suggested === "archive" && (
            <p className="flagged-card__suggestion flagged-card__suggestion--archive t-para-sm">
              Suggested: archive broken or security-risk tools.
            </p>
          )}
        </div>
      </div>
      <div className="flagged-card__actions">
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button
          variant={suggested === "deprecate" ? "primary" : "secondary"}
          size="sm"
          onClick={onDeprecate}
          className={suggested === "deprecate" ? "flagged-card__action--suggested" : undefined}
        >
          Deprecate
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onArchive}
          className={suggested === "archive" ? "flagged-card__action--suggested" : undefined}
        >
          Archive tool
        </Button>
      </div>
    </li>
  );
}

function ApprovalCard({
  tool,
  rejectingId,
  rejectReason,
  onRejectReasonChange,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  onApprove,
}: {
  tool: Tool;
  rejectingId: string | null;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onConfirmReject: () => void;
  onApprove: () => void;
}) {
  const isIdea = isIdeaSubmission(tool);
  const checksPass = passesLightApprovalCheck(tool);

  return (
    <li
      className={`approval-card${isIdea ? " approval-card--idea" : " approval-card--golive"}`}
    >
      <div className="approval-card__kind">
        <span className="approval-card__kind-label t-tag-sm">
          {isIdea ? "Idea submission" : "Go-live submission"}
        </span>
        {!isIdea && toolHasMcpType(tool) && (
          <span className="approval-card__mcp-badge t-tag-sm">
            Needs stricter review
          </span>
        )}
      </div>

      <div className="approval-card__header">
        <TypeTags types={tool.types} />
        <span className="approval-card__team t-tag-rg">{tool.team}</span>
      </div>

      <h2 className="approval-card__title t-heading-md">
        <Link href={`/tools/${tool.id}`} className="text-link">
          {tool.name}
        </Link>
      </h2>
      <Link href={`/tools/${tool.id}`} className="approval-card__details-link t-para-sm text-link">
        Open full details
        <Icon name="arrow-right" size={14} />
      </Link>
      <p className="approval-card__oneliner t-para-rg">{tool.oneLiner}</p>

      <p className="approval-card__meta t-para-sm text-muted">
        Filed by {formatSubmitterLabel(tool.submittedBy)} on{" "}
        {formatSubmissionDate(tool.lastUpdated)}
      </p>
      <p className="approval-card__meta t-para-sm text-muted">
        Owner: {tool.owner.name} ({tool.owner.slackId})
      </p>

      {!isIdea && (
        <>
          <dl className="approval-card__review-grid">
            <div>
              <dt className="t-label-sm">Access level</dt>
              <dd className="t-para-rg">{formatAccessLevel(tool.accessLevel)}</dd>
            </div>
            <div>
              <dt className="t-label-sm">Write-capable</dt>
              <dd className="t-para-rg">{tool.writeCapable ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="t-label-sm">Types</dt>
              <dd className="t-para-rg">{formatToolTypes(tool.types)}</dd>
            </div>
            {tool.link && (
              <div className="approval-card__link-row">
                <dt className="t-label-sm">Link</dt>
                <dd className="t-para-sm">
                  <a
                    href={tool.link}
                    className="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {tool.link}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <p className="gate-eligibility-note t-para-sm text-muted">
            {GATE_ELIGIBILITY_NOTE}
          </p>
        </>
      )}

      <ul className="approval-card__checks t-para-sm">
        <li className={checksPass ? "approval-card__check--pass" : ""}>
          <Icon name="checkmark" size={14} />
          Name, owner, and one-liner look real — not junk
        </li>
      </ul>

      {rejectingId === tool.id ? (
        <div className="approval-card__reject-form">
          <textarea
            className="form-field__input form-field__textarea t-para-rg"
            rows={3}
            placeholder="Reason for rejection (required — sent to submitter)"
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
          />
          <div className="approval-card__actions">
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirmReject}
              disabled={!rejectReason.trim()}
            >
              Confirm reject
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancelReject}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="approval-card__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            disabled={!checksPass}
          >
            {isIdea ? "Publish idea" : "Approve & go live"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onStartReject}>
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}

export function ApprovalsView() {
  const {
    pendingTools,
    flaggedTools,
    approveTool,
    rejectTool,
    dismissFlag,
    archiveFromFlag,
    deprecateFromFlag,
    canApprove,
  } = useApp();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const ideaQueue = useMemo(
    () => pendingTools.filter(isIdeaSubmission),
    [pendingTools],
  );
  const goLiveQueue = useMemo(
    () => pendingTools.filter(isGoLiveSubmission),
    [pendingTools],
  );

  if (!canApprove) {
    return (
      <EmptyState
        icon="shield-tick"
        title="Admin access required"
        description="Switch to Admin role in the header to review pending submissions."
      />
    );
  }

  function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    rejectTool(id, rejectReason);
    setRejectingId(null);
    setRejectReason("");
  }

  function cardProps(tool: Tool) {
    return {
      tool,
      rejectingId,
      rejectReason,
      onRejectReasonChange: setRejectReason,
      onStartReject: () => setRejectingId(tool.id),
      onCancelReject: () => {
        setRejectingId(null);
        setRejectReason("");
      },
      onConfirmReject: () => handleReject(tool.id),
      onApprove: () => approveTool(tool.id),
    };
  }

  const queueEmpty = pendingTools.length === 0 && flaggedTools.length === 0;

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Approval queue</h1>
          <p className="page-header__desc t-para-md">
            Permissive review — check existence, owner, and that it&apos;s not
            junk. The real gate is going live.
          </p>
        </div>
        <Link href="/admin/metrics" className="btn btn--secondary btn--sm t-cta-sm">
          Metrics
        </Link>
      </div>

      {flaggedTools.length > 0 && (
        <section className="flagged-queue">
          <h2 className="flagged-queue__title t-heading-sm">
            Flagged ({flaggedTools.length})
          </h2>
          <p className="flagged-queue__desc t-para-sm text-muted">
            User-reported issues — dismiss, deprecate, or archive based on the
            reason.
          </p>
          <ul className="flagged-list">
            {flaggedTools.map((flag) => (
              <FlaggedCard
                key={flag.id}
                flag={flag}
                onDismiss={() => dismissFlag(flag.id)}
                onDeprecate={() => deprecateFromFlag(flag.id)}
                onArchive={() => archiveFromFlag(flag.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {queueEmpty ? (
        <EmptyState
          icon="checkmark"
          title="All caught up"
          description="No pending submissions or flagged tools right now."
        />
      ) : pendingTools.length === 0 ? (
        <EmptyState
          icon="checkmark"
          title="No pending submissions"
          description="Review flagged tools above if any are open."
        />
      ) : (
        <div className="approval-queues">
          {ideaQueue.length > 0 && (
            <section className="approval-queue">
              <h2 className="approval-queue__title t-heading-sm">
                Idea submissions ({ideaQueue.length})
              </h2>
              <p className="approval-queue__desc t-para-sm text-muted">
                Planned ideas with no link — light review, then publish to the
                catalog.
              </p>
              <ul className="approval-list">
                {ideaQueue.map((tool) => (
                  <ApprovalCard key={tool.id} {...cardProps(tool)} />
                ))}
              </ul>
            </section>
          )}

          {goLiveQueue.length > 0 && (
            <section className="approval-queue">
              <h2 className="approval-queue__title t-heading-sm">
                Go-live submissions ({goLiveQueue.length})
              </h2>
              <p className="approval-queue__desc t-para-sm text-muted">
                Tools with links and access levels — full row review before
                going live.
              </p>
              <ul className="approval-list">
                {goLiveQueue.map((tool) => (
                  <ApprovalCard key={tool.id} {...cardProps(tool)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

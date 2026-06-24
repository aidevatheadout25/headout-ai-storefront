"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RequestStatusBadge } from "@/components/RequestStatusBadge";
import { useApp } from "@/context/AppContext";
import {
  canUpvoteRequest,
  getDemandUpvoteCount,
  isHighDemand,
  requestUpvotedByMe,
} from "@/lib/requests";
import { formatSubmissionDate } from "@/lib/toolMeta";
import type { NeedRequest } from "@/lib/types";

type RequestCardProps = {
  request: NeedRequest;
  compact?: boolean;
};

export function RequestCard({ request, compact = false }: RequestCardProps) {
  const router = useRouter();
  const {
    currentUser,
    mockUsers,
    canClaimRequest,
    upvoteRequest,
    claimRequest,
    getToolById,
  } = useApp();

  const upvoted = requestUpvotedByMe(request, currentUser.id);
  const demandVotes = getDemandUpvoteCount(request, mockUsers);
  const highDemand = isHighDemand(request, mockUsers);
  const isSubmitter = request.requestedById === currentUser.id;
  const linkedTool = request.linkedToolId
    ? getToolById(request.linkedToolId)
    : undefined;

  function handleClaim() {
    const claimedId = claimRequest(request.id);
    if (claimedId) {
      router.push(`/funnel?requestId=${claimedId}`);
    }
  }

  return (
    <div className={`request-card tool-card${compact ? " request-card--compact" : ""}`}>
      <div className="request-card__header">
        <RequestStatusBadge status={request.status} />
        {highDemand && (
          <span className="request-status request-status--demand t-tag-sm">
            High demand
          </span>
        )}
        {request.stakesLevel === "high" && (
          <span className="request-status request-status--stakes t-tag-sm">
            High stakes
          </span>
        )}
        <span className="request-card__team t-tag-rg">{request.team}</span>
      </div>

      <h2 className="request-card__title t-heading-rg">{request.title}</h2>
      <p className="request-card__problem t-para-rg">{request.problem}</p>

      {!compact && (
        <p className="request-card__meta t-para-sm text-muted">
          Requested by {request.requestedBy.name} ({request.requestedBy.slackId})
          {" · "}
          {formatSubmissionDate(request.createdAt)}
        </p>
      )}

      {request.status === "parked" && request.parkedReason && (
        <p className="request-card__parked t-para-sm">
          Parked: {request.parkedReason}
        </p>
      )}

      {request.tags.length > 0 && !compact && (
        <div className="request-card__tags">
          {request.tags.map((tag) => (
            <span key={tag} className="tag-chip t-tag-rg">
              {tag}
            </span>
          ))}
        </div>
      )}

      {request.status === "claimed" && request.claimedBy && (
        <p className="request-card__status-note t-para-sm">
          Claimed by <strong>{request.claimedBy.name}</strong>
          {linkedTool && (
            <>
              {" "}
              →{" "}
              <Link href={`/tools/${linkedTool.id}`} className="text-link">
                {linkedTool.name}
              </Link>
            </>
          )}
        </p>
      )}

      {request.status === "fulfilled" && request.claimedBy && linkedTool && (
        <p className="request-card__status-note t-para-sm">
          Built by <strong>{request.claimedBy.name}</strong> →{" "}
          <Link href={`/tools/${linkedTool.id}`} className="text-link">
            {linkedTool.name}
          </Link>
        </p>
      )}

      {!compact && (
        <div className="request-card__actions">
          {!isSubmitter && (
            <button
              type="button"
              className={`upvote-btn t-cta-sm${upvoted ? " upvote-btn--active" : ""}`}
              onClick={() => upvoteRequest(request.id)}
              disabled={!canUpvoteRequest(request, currentUser.id) || upvoted}
              aria-pressed={upvoted}
            >
              <Icon name="checkmark" size={14} />
              {upvoted ? "Upvoted" : "Upvote"} ({demandVotes})
            </button>
          )}

          {isSubmitter && (
            <span className="request-card__hint t-para-sm text-muted">
              {demandVotes} upvote{demandVotes === 1 ? "" : "s"} from others
            </span>
          )}

          {request.status === "open" && canClaimRequest && (
            <Button variant="primary" size="sm" onClick={handleClaim}>
              Claim & build
            </Button>
          )}

          {request.status === "open" && !canClaimRequest && (
            <span className="request-card__hint t-para-sm text-muted">
              Builders can claim this need
            </span>
          )}
        </div>
      )}
    </div>
  );
}

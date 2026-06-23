"use client";

import { useState } from "react";
import { TypeTag } from "@/components/TypeTag";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";

export function ApprovalsView() {
  const { pendingTools, approveTool, rejectTool, canApprove } = useApp();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Approval queue</h1>
          <p className="page-header__desc t-para-md">
            Review pending submissions — approve to publish or reject with a
            reason.
          </p>
        </div>
      </div>

      {pendingTools.length === 0 ? (
        <EmptyState
          icon="checkmark"
          title="All caught up"
          description="No pending submissions right now. When builders submit tools, they'll show up here."
        />
      ) : (
        <ul className="approval-list">
          {pendingTools.map((tool) => (
            <li key={tool.id} className="approval-card">
              <div className="approval-card__header">
                <TypeTag type={tool.type} />
                <span className="approval-card__team t-tag-rg">{tool.team}</span>
              </div>
              <h2 className="approval-card__title t-heading-md">{tool.name}</h2>
              <p className="approval-card__oneliner t-para-rg">{tool.oneLiner}</p>
              <p className="approval-card__meta t-para-sm text-muted">
                {tool.owner.name} ({tool.owner.slackId}) ·{" "}
                <a href={tool.link} className="text-link" target="_blank" rel="noopener noreferrer">
                  {tool.link}
                </a>
              </p>

              {rejectingId === tool.id ? (
                <div className="approval-card__reject-form">
                  <textarea
                    className="form-field__input form-field__textarea t-para-rg"
                    rows={3}
                    placeholder="Reason for rejection (sent to submitter)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="approval-card__actions">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(tool.id)}
                      disabled={!rejectReason.trim()}
                    >
                      Confirm reject
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="approval-card__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => approveTool(tool.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRejectingId(tool.id)}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

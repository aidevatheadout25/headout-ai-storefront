"use client";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { formatSubmissionDate } from "@/lib/toolMeta";
import { ROLE_LABELS } from "@/lib/types";

export function AdminBuildersView() {
  const {
    canManageBuilders,
    mockUsers,
    builderAccessRequests,
    grantBuilderRole,
    revokeBuilderRole,
    approveBuilderAccessRequest,
    dismissBuilderAccessRequest,
  } = useApp();

  if (!canManageBuilders) {
    return (
      <EmptyState
        icon="shield-tick"
        title="Admin access required"
        description="Switch to Admin role in the header to manage builder access."
      />
    );
  }

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Builder management</h1>
          <p className="page-header__desc t-para-md">
            Grant or revoke builder access — builders can register tools and
            claim requests.
          </p>
        </div>
      </div>

      {builderAccessRequests.length > 0 && (
        <section className="builder-queue">
          <h2 className="builder-queue__title t-heading-sm">
            Access requests ({builderAccessRequests.length})
          </h2>
          <ul className="builder-queue__list">
            {builderAccessRequests.map((entry) => (
              <li key={entry.id} className="builder-queue__card tool-card">
                <p className="t-heading-rg">{entry.userName}</p>
                <p className="t-para-sm text-muted">
                  {entry.userSlackId} · {entry.team} ·{" "}
                  {formatSubmissionDate(entry.createdAt)}
                </p>
                <div className="builder-queue__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => approveBuilderAccessRequest(entry.id)}
                  >
                    Grant builder
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => dismissBuilderAccessRequest(entry.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="builder-users">
        <h2 className="builder-users__title t-heading-sm">Mock users</h2>
        <p className="builder-users__desc t-para-sm text-muted">
          Demo roster — grant builder to let someone register tools and claim
          requests.
        </p>
        <ul className="builder-users__list">
          {mockUsers.map((user) => (
            <li key={user.id} className="builder-users__row">
              <div>
                <p className="t-para-rg">{user.name}</p>
                <p className="t-para-sm text-muted">
                  {user.slackId} · {user.team}
                </p>
              </div>
              <span className={`builder-users__role t-tag-sm builder-users__role--${user.role}`}>
                {ROLE_LABELS[user.role]}
              </span>
              <div className="builder-users__actions">
                {user.role === "viewer" ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => grantBuilderRole(user.id)}
                  >
                    Grant builder
                  </Button>
                ) : user.role === "builder" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => revokeBuilderRole(user.id)}
                  >
                    Revoke builder
                  </Button>
                ) : (
                  <span className="t-para-sm text-muted">Admin</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

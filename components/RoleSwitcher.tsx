"use client";

import { ROLE_LABELS, type Role } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { Icon } from "@/components/Icon";

type RoleSwitcherProps = {
  layout?: "inline" | "sidebar";
};

const ROLES: Role[] = ["viewer", "builder", "admin"];

export function RoleSwitcher({ layout = "inline" }: RoleSwitcherProps) {
  const { role, setRole } = useApp();

  return (
    <div
      className={`role-switcher${layout === "sidebar" ? " role-switcher--sidebar" : ""}`}
    >
      <span className="role-switcher__label t-label-sm">
        <Icon name="users" size={16} />
        Role
      </span>
      <div className="role-switcher__options" role="radiogroup" aria-label="Demo role">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            className={`role-switcher__option t-label-sm${role === r ? " role-switcher__option--active" : ""}`}
            onClick={() => setRole(r)}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>
      <p className="role-switcher__caption t-label-sm text-muted">
        Demo: roles are admin-assigned in production.
      </p>
    </div>
  );
}

export function RoleBanner() {
  const { role, canSubmitTool, canClaimRequest, canApprove } = useApp();

  const messages: Record<Role, string> = {
    viewer:
      "You're a viewer — search, file needs, upvote requests, and track your own demand. Builder access is admin-granted.",
    builder:
      "You're a builder — file needs, submit tools, claim requests, and maintain what you own.",
    admin:
      "You're an admin — approve tools, moderate flags, manage builders, and grant builder access.",
  };

  return (
    <div className={`role-banner role-banner--${role}`}>
      <p className="role-banner__text t-para-sm">
        <strong className="t-label-rg-heavy">{ROLE_LABELS[role]} mode:</strong>{" "}
        {messages[role]}
        {canApprove && role === "admin" && (
          <span className="role-banner__badge t-tag-sm">
            Admin queues visible
          </span>
        )}
        {canSubmitTool && role === "builder" && (
          <span className="role-banner__badge t-tag-sm">
            Submit & claim enabled
          </span>
        )}
        {canClaimRequest && role === "admin" && (
          <span className="role-banner__badge t-tag-sm">
            Can claim requests
          </span>
        )}
      </p>
    </div>
  );
}

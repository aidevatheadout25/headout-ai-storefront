"use client";

import { ROLE_LABELS, type Role } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { Icon } from "@/components/Icon";

const ROLES: Role[] = ["viewer", "builder", "admin"];

export function RoleSwitcher() {
  const { role, setRole } = useApp();

  return (
    <div className="role-switcher">
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
    </div>
  );
}

export function RoleBanner() {
  const { role, canSubmit, canApprove } = useApp();

  const messages: Record<Role, string> = {
    viewer: "You're browsing as a viewer — you can search and discover, but can't submit tools.",
    builder: "You're a builder — submit tools and edit your own entries.",
    admin: "You're an admin — approve submissions and manage the full registry.",
  };

  return (
    <div className={`role-banner role-banner--${role}`}>
      <p className="role-banner__text t-para-sm">
        <strong className="t-label-rg-heavy">{ROLE_LABELS[role]} mode:</strong>{" "}
        {messages[role]}
        {canApprove && role === "admin" && (
          <span className="role-banner__badge t-tag-sm">
            Approval queue visible
          </span>
        )}
        {canSubmit && role === "builder" && (
          <span className="role-banner__badge t-tag-sm">Submit enabled</span>
        )}
      </p>
    </div>
  );
}

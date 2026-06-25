"use client";

import { ROLE_LABELS, type Role } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { Icon } from "@/components/Icon";

type RoleSwitcherProps = {
  layout?: "inline" | "sidebar";
};

const ROLES: Role[] = ["member", "admin"];

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
        Demo: everyone can find and build; admin governs the catalogue.
      </p>
    </div>
  );
}

export function RoleBanner() {
  const { role, canApprove } = useApp();

  const messages: Record<Role, string> = {
    member:
      "Find tools, scope new ideas with the PM chat, build yourself, and register back to the catalogue.",
    admin:
      "Approve new catalogue entries, moderate flags, and deprecate tools.",
  };

  return (
    <div className={`role-banner role-banner--${role}`}>
      <p className="role-banner__text t-para-sm">
        <strong className="t-label-rg-heavy">{ROLE_LABELS[role]} mode:</strong>{" "}
        {messages[role]}
        {canApprove && (
          <span className="role-banner__badge t-tag-sm">
            Admin queues visible
          </span>
        )}
      </p>
    </div>
  );
}

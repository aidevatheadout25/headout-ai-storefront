"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";

type NavItem = {
  href: string;
  label: string;
  badge?: number;
  admin?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

function navClass(pathname: string, href: string) {
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href));
  return `app-sidebar__link t-label-rg${active ? " app-sidebar__link--active" : ""}`;
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canApprove, pendingTools, flaggedTools } = useApp();

  const approvalBadgeCount = pendingTools.length + flaggedTools.length;

  const sections: NavSection[] = [
    {
      title: "Discover",
      items: [
        { href: "/", label: "Home" },
        { href: "/registry", label: "Browse catalogue" },
      ],
    },
    {
      title: "You",
      items: [
        { href: "/my-submissions", label: "My activity" },
        { href: "/submit", label: "Register a tool" },
      ],
    },
  ];

  if (canApprove) {
    sections.push({
      title: "Admin",
      items: [
        {
          href: "/admin/approvals",
          label: "Approvals",
          badge: approvalBadgeCount,
          admin: true,
        },
        { href: "/admin/metrics", label: "Metrics", admin: true },
      ],
    });
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  function renderNav() {
    return sections.map((section) => (
      <div key={section.title} className="app-sidebar__section">
        <p className="app-sidebar__section-title t-label-sm">{section.title}</p>
        <ul className="app-sidebar__list">
          {section.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${navClass(pathname, item.href)}${item.admin ? " app-sidebar__link--admin" : ""}`}
                onClick={closeMobile}
              >
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="app-sidebar__badge">{item.badge}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ));
  }

  return (
    <>
      <div className="app-mobile-bar">
        <button
          type="button"
          className="app-mobile-bar__menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <span className="app-mobile-bar__burger" aria-hidden="true" />
        </button>
        <Link href="/" className="app-mobile-bar__brand" onClick={closeMobile}>
          <img
            src="/design-system/assets/logo/headout.svg"
            alt="Headout"
            width={88}
            height={22}
            className="app-sidebar__logo"
          />
          <span className="t-subheading-rg">AI Storefront</span>
        </Link>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="app-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={closeMobile}
        />
      )}

      <aside
        className={`app-sidebar${mobileOpen ? " app-sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="app-sidebar__top">
          <Link href="/" className="app-sidebar__brand" onClick={closeMobile}>
            <img
              src="/design-system/assets/logo/headout.svg"
              alt="Headout"
              width={100}
              height={24}
              className="app-sidebar__logo"
            />
            <span className="app-sidebar__title t-subheading-rg">
              AI Storefront
            </span>
          </Link>
          <button
            type="button"
            className="app-sidebar__close"
            onClick={closeMobile}
            aria-label="Close navigation"
          >
            <Icon name="cross" size={18} />
          </button>
        </div>

        <nav className="app-sidebar__nav">{renderNav()}</nav>

        <div className="app-sidebar__footer">
          <RoleSwitcher layout="sidebar" />
        </div>
      </aside>
    </>
  );
}

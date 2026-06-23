"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";

const BASE_NAV = [
  { href: "/", label: "Home" },
  { href: "/registry", label: "Registry" },
  { href: "/requests", label: "Requests" },
  { href: "/file-need", label: "File a need" },
  { href: "/my-submissions", label: "My requests & submissions" },
] as const;

function navClass(pathname: string, href: string) {
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href));
  return `site-header__nav-link t-label-rg${active ? " site-header__nav-link--active" : ""}`;
}

export function Header() {
  const pathname = usePathname();
  const {
    canApprove,
    canSubmitTool,
    pendingTools,
    flaggedTools,
    builderAccessRequests,
  } = useApp();
  const approvalBadgeCount = pendingTools.length + flaggedTools.length;
  const buildersBadgeCount = builderAccessRequests.length;

  function renderNav(className: string) {
    return (
      <>
        {BASE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${navClass(pathname, item.href)}${className ? ` ${className}` : ""}`}
          >
            {item.label}
          </Link>
        ))}
        {canSubmitTool && (
          <Link
            href="/submit"
            className={navClass(pathname, "/submit")}
          >
            Submit a tool
          </Link>
        )}
        {canApprove && (
          <>
            <Link
              href="/admin/approvals"
              className={`${navClass(pathname, "/admin/approvals")} site-header__nav-link--admin`}
            >
              Approvals
              {approvalBadgeCount > 0 && (
                <span className="site-header__badge">{approvalBadgeCount}</span>
              )}
            </Link>
            <Link
              href="/admin/metrics"
              className={`${navClass(pathname, "/admin/metrics")} site-header__nav-link--admin`}
            >
              Metrics
            </Link>
            <Link
              href="/admin/builders"
              className={`${navClass(pathname, "/admin/builders")} site-header__nav-link--admin`}
            >
              Builders
              {buildersBadgeCount > 0 && (
                <span className="site-header__badge">{buildersBadgeCount}</span>
              )}
            </Link>
          </>
        )}
      </>
    );
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <img
            src="/design-system/assets/logo/headout.svg"
            alt="Headout"
            width={100}
            height={24}
            className="site-header__logo"
          />
          <span className="site-header__title t-subheading-rg">
            AI Storefront
          </span>
        </Link>

        <nav className="site-header__nav" aria-label="Main navigation">
          {renderNav("")}
        </nav>

        <div className="site-header__actions">
          <RoleSwitcher />
          <ThemeToggle />
        </div>
      </div>

      <nav
        className="site-header__mobile-nav"
        aria-label="Mobile navigation"
      >
        {renderNav("")}
      </nav>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/registry", label: "Registry" },
] as const;

function navClass(pathname: string, href: string) {
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href));
  return `site-header__nav-link t-label-rg${active ? " site-header__nav-link--active" : ""}`;
}

export function Header() {
  const pathname = usePathname();
  const { canApprove, pendingTools, flaggedTools, hasSubmissions } = useApp();
  const approvalBadgeCount = pendingTools.length + flaggedTools.length;

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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={navClass(pathname, item.href)}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/submit" className={navClass(pathname, "/submit")}>
            Submit a tool
          </Link>
          {hasSubmissions && (
            <Link
              href="/my-submissions"
              className={navClass(pathname, "/my-submissions")}
            >
              My submissions
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
            </>
          )}
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
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navClass(pathname, item.href)}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/submit" className={navClass(pathname, "/submit")}>
          Submit a tool
        </Link>
        {hasSubmissions && (
          <Link
            href="/my-submissions"
            className={navClass(pathname, "/my-submissions")}
          >
            My submissions
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
          </>
        )}
      </nav>
    </header>
  );
}

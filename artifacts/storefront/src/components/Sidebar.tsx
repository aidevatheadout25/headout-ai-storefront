import Link from "@/compat/next-link";
import { usePathname, useSearchParams } from "@/compat/next-navigation";
import { useEffect, useId, useMemo, useState, type MouseEvent } from "react";
import { Icon } from "@/components/Icon";
import { useRegistryNavigation } from "@/hooks/useRegistryNavigation";
import { useAuthContext } from "@/lib/auth-context";
import { useConversationsContext } from "@/lib/conversations-context";
import {
  isCatalogueHrefActive,
  registryParamsFromSearchParams,
} from "@/lib/registryNav";
import { CATALOGUE_CATEGORIES } from "@/lib/types";

/** Browse categories only — building blocks are not part of the v1 catalogue. */
const BROWSE_CATEGORIES = CATALOGUE_CATEGORIES.filter(
  (category) => category.tab !== "blocks",
);

function navClass(active: boolean) {
  return `app-sidebar__link t-label-rg${active ? " app-sidebar__link--active" : ""}`;
}

function userDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Signed in";
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigateRegistry = useRegistryNavigation();
  const cataloguePanelId = useId();
  const { user, isAuthenticated, isLoading: authLoading, login, logout } =
    useAuthContext();
  const { conversations } = useConversationsContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(() =>
    pathname.startsWith("/registry"),
  );
  const [pendingCatalogueHref, setPendingCatalogueHref] = useState<string | null>(
    null,
  );

  const registryParams = useMemo(
    () => registryParamsFromSearchParams(searchParams),
    [searchParams],
  );

  const activeConversationId =
    pathname === "/" ? searchParams.get("c") : null;

  useEffect(() => {
    if (pathname.startsWith("/registry")) {
      setCatalogueOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    setPendingCatalogueHref(null);
  }, [searchParams]);

  const catalogueSectionActive = BROWSE_CATEGORIES.some((category) =>
    isCatalogueHrefActive(pathname, registryParams, category.href),
  );

  function closeMobile() {
    setMobileOpen(false);
  }

  function navigateCatalogue(href: string, event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setPendingCatalogueHref(href);
    setCatalogueOpen(true);
    navigateRegistry(href);
    closeMobile();
  }

  function isCategoryActive(href: string) {
    if (pendingCatalogueHref) {
      return pendingCatalogueHref === href;
    }
    return isCatalogueHrefActive(pathname, registryParams, href);
  }

  const homeActive = pathname === "/" && !activeConversationId;

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
          <div className="app-sidebar__top-actions">
            {isAuthenticated && (
              <Link
                href="/"
                className="app-sidebar__new-chat-btn"
                title="New chat"
                onClick={closeMobile}
                aria-label="New chat"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </Link>
            )}
            <button
              type="button"
              className="app-sidebar__close"
              onClick={closeMobile}
              aria-label="Close navigation"
            >
              <Icon name="cross" size={18} />
            </button>
          </div>
        </div>

        <nav className="app-sidebar__nav">
          <div className="app-sidebar__section">
            <p className="app-sidebar__section-title t-label-sm">Discover</p>
            <ul className="app-sidebar__list">
              <li>
                <Link
                  href="/"
                  className={navClass(homeActive)}
                  onClick={closeMobile}
                >
                  Home
                </Link>
              </li>
              <li className="app-sidebar__catalogue">
                <button
                  type="button"
                  className={`app-sidebar__link app-sidebar__catalogue-trigger t-label-rg${
                    catalogueSectionActive ? " app-sidebar__link--active" : ""
                  }${catalogueOpen ? " app-sidebar__catalogue-trigger--open" : ""}`}
                  onClick={() => setCatalogueOpen((open) => !open)}
                  aria-expanded={catalogueOpen}
                  aria-controls={cataloguePanelId}
                >
                  <span>Browse catalogue</span>
                  <Icon
                    name="chevron-down"
                    size={16}
                    className="app-sidebar__catalogue-chevron"
                  />
                </button>
                <div
                  id={cataloguePanelId}
                  className={`app-sidebar__catalogue-panel${
                    catalogueOpen ? " app-sidebar__catalogue-panel--open" : ""
                  }`}
                  aria-hidden={!catalogueOpen}
                >
                  <div className="app-sidebar__catalogue-panel-inner">
                    <ul className="app-sidebar__catalogue-list">
                      {BROWSE_CATEGORIES.map((category) => {
                        const active = isCategoryActive(category.href);
                        return (
                          <li key={category.href}>
                            <Link
                              href={category.href}
                              className={navClass(active)}
                              onClick={(event) =>
                                navigateCatalogue(category.href, event)
                              }
                              aria-current={active ? "page" : undefined}
                            >
                              {category.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {isAuthenticated && (
            <div className="app-sidebar__section">
              <div className="app-sidebar__chats-header">
                <p className="app-sidebar__section-title t-label-sm">
                  Your chats
                </p>
              </div>
              {conversations.length === 0 ? (
                <p className="app-sidebar__chats-empty t-para-sm text-muted">
                  No saved chats yet. Ask the concierge something to start one.
                </p>
              ) : (
                <ul className="app-sidebar__list app-sidebar__chats-list">
                  {conversations.map((conversation) => {
                    const active = activeConversationId === conversation.id;
                    return (
                      <li key={conversation.id}>
                        <Link
                          href={`/?c=${encodeURIComponent(conversation.id)}`}
                          className={navClass(active)}
                          onClick={closeMobile}
                          aria-current={active ? "page" : undefined}
                          title={conversation.title}
                        >
                          <span className="app-sidebar__chat-title">
                            {conversation.title}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </nav>

        <div className="app-sidebar__account">
          {authLoading ? (
            <p className="t-para-sm text-muted">Loading…</p>
          ) : isAuthenticated && user ? (
            <div className="app-sidebar__account-row">
              <span
                className="app-sidebar__account-name t-label-rg"
                title={user.email ?? undefined}
              >
                {userDisplayName(user)}
              </span>
              <button
                type="button"
                className="app-sidebar__account-action t-label-sm"
                onClick={logout}
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="app-sidebar__account-action t-label-rg"
              onClick={login}
            >
              Sign in
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

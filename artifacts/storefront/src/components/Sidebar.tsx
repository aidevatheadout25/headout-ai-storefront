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

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
  const [chatQuery, setChatQuery] = useState("");

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

  const filteredConversations = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(q),
    );
  }, [chatQuery, conversations]);

  const groupedConversations = useMemo(() => {
    const today: typeof filteredConversations = [];
    const earlier: typeof filteredConversations = [];
    const now = new Date();
    for (const conversation of filteredConversations) {
      const updated = new Date(conversation.updatedAt);
      if (!Number.isNaN(updated.getTime()) && isSameLocalDay(updated, now)) {
        today.push(conversation);
      } else {
        earlier.push(conversation);
      }
    }
    return { today, earlier };
  }, [filteredConversations]);

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

  function renderConversationLink(
    conversation: (typeof conversations)[number],
  ) {
    const active = activeConversationId === conversation.id;
    const relative = formatRelativeTime(conversation.updatedAt);
    return (
      <li key={conversation.id}>
        <Link
          href={`/?c=${encodeURIComponent(conversation.id)}`}
          className={navClass(active)}
          onClick={closeMobile}
          aria-current={active ? "page" : undefined}
          title={conversation.title}
        >
          <span className="app-sidebar__chat-meta">
            <span className="app-sidebar__chat-title">{conversation.title}</span>
            {relative && (
              <span className="app-sidebar__chat-time t-label-xs">{relative}</span>
            )}
          </span>
        </Link>
      </li>
    );
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
        {isAuthenticated && (
          <Link
            href="/"
            className="app-mobile-bar__new-chat"
            onClick={closeMobile}
            aria-label="New chat"
            title="New chat"
          >
            <Icon name="spark" size={18} />
          </Link>
        )}
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

        {isAuthenticated && (
          <div className="app-sidebar__new-chat-wrap">
            <Link
              href="/"
              className="app-sidebar__new-chat"
              onClick={closeMobile}
              aria-current={homeActive ? "page" : undefined}
            >
              <Icon name="spark" size={16} />
              New chat
            </Link>
          </div>
        )}

        <nav className="app-sidebar__nav">
          <div className="app-sidebar__discover">
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
          </div>

          {isAuthenticated && (
            <div className="app-sidebar__chats">
              <div className="app-sidebar__chats-header">
                <p className="app-sidebar__section-title t-label-sm">
                  Your chats
                </p>
              </div>
              {conversations.length > 0 && (
                <div className="app-sidebar__chats-search">
                  <Icon
                    name="search"
                    size={14}
                    className="app-sidebar__chats-search-icon"
                  />
                  <input
                    type="search"
                    className="app-sidebar__chats-search-input t-para-sm"
                    placeholder="Search chats"
                    value={chatQuery}
                    onChange={(event) => setChatQuery(event.target.value)}
                    aria-label="Search chats"
                  />
                </div>
              )}
              <div className="app-sidebar__chats-scroll">
                {conversations.length === 0 ? (
                  <p className="app-sidebar__chats-empty t-para-sm text-muted">
                    No saved chats yet. Ask the concierge something to start one.
                  </p>
                ) : filteredConversations.length === 0 ? (
                  <p className="app-sidebar__chats-empty t-para-sm text-muted">
                    No chats match “{chatQuery.trim()}”.
                  </p>
                ) : (
                  <>
                    {groupedConversations.today.length > 0 && (
                      <div className="app-sidebar__chats-group">
                        <p className="app-sidebar__chats-group-label t-label-xs">
                          Today
                        </p>
                        <ul className="app-sidebar__list app-sidebar__chats-list">
                          {groupedConversations.today.map(renderConversationLink)}
                        </ul>
                      </div>
                    )}
                    {groupedConversations.earlier.length > 0 && (
                      <div className="app-sidebar__chats-group">
                        {groupedConversations.today.length > 0 && (
                          <p className="app-sidebar__chats-group-label t-label-xs">
                            Earlier
                          </p>
                        )}
                        <ul className="app-sidebar__list app-sidebar__chats-list">
                          {groupedConversations.earlier.map(
                            renderConversationLink,
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
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

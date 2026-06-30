import Link from "@/compat/next-link";
import { usePathname, useSearchParams } from "@/compat/next-navigation";
import { useEffect, useId, useMemo, useState, type MouseEvent } from "react";
import { Icon } from "@/components/Icon";
import { useRegistryNavigation } from "@/hooks/useRegistryNavigation";
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

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigateRegistry = useRegistryNavigation();
  const cataloguePanelId = useId();
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

  const homeActive = pathname === "/";

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
        </nav>
      </aside>
    </>
  );
}

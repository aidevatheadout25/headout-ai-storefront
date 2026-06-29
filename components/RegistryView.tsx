"use client";

import { useEffect, useMemo, useState } from "react";
import { ToolCard } from "@/components/ToolCard";
import { EmptyState } from "@/components/EmptyState";
import { ZeroResultsPanel } from "@/components/ZeroResultsPanel";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { useRegistryNavigation } from "@/hooks/useRegistryNavigation";
import { filterRegistryTools, getClosestKits } from "@/lib/askBar";
import { filterBuildingBlocks } from "@/lib/funnel";
import { getKitById } from "@/lib/mockData";
import { sortRegistryTools, type RegistrySort } from "@/lib/registry";
import type { RegistryUrlParams } from "@/lib/registryNav";
import { BuildingBlockCard } from "@/components/BuildingBlockCard";
import {
  CATALOGUE_CATEGORIES,
  TEAMS,
  formatToolType,
  normalizeCatalogueTypeParam,
  type Team,
} from "@/lib/types";

const SORT_OPTIONS: { value: RegistrySort; label: string }[] = [
  { value: "most-used", label: "Most used" },
  { value: "recent", label: "Recently added" },
  { value: "a-z", label: "A–Z" },
];

type RegistryViewProps = {
  urlParams: RegistryUrlParams;
};

export function RegistryView({ urlParams }: RegistryViewProps) {
  const navigateRegistry = useRegistryNavigation();
  const { approvedTools, buildingBlocks } = useApp();
  const kitParam = urlParams.kit ?? "";
  const tabParam = urlParams.tab ?? "tools";
  const registryTab = tabParam === "blocks" ? "blocks" : "tools";
  const typeFilter = normalizeCatalogueTypeParam(urlParams.type ?? "");
  const [search, setSearch] = useState(urlParams.q ?? "");
  const [teamFilter, setTeamFilter] = useState("");
  const [sort, setSort] = useState<RegistrySort>("most-used");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    setSearch(urlParams.q ?? "");
  }, [urlParams.q]);

  const activeCategory = useMemo(
    () =>
      CATALOGUE_CATEGORIES.find(
        (category) =>
          category.type === typeFilter ||
          (category.tab === "blocks" && registryTab === "blocks") ||
          (!category.type &&
            !category.tab &&
            registryTab === "tools" &&
            !typeFilter &&
            !kitParam),
      ),
    [typeFilter, registryTab, kitParam],
  );

  const activeKit = kitParam ? getKitById(kitParam) : undefined;

  const filteredBlocks = useMemo(
    () => filterBuildingBlocks(buildingBlocks, search),
    [buildingBlocks, search],
  );

  const filtered = useMemo(() => {
    const results = filterRegistryTools(
      approvedTools,
      search,
      typeFilter,
      teamFilter,
      kitParam || undefined,
    );
    return sortRegistryTools(results, sort);
  }, [approvedTools, search, typeFilter, teamFilter, kitParam, sort]);

  const hasActiveFilters = Boolean(
    search || typeFilter || teamFilter || activeKit,
  );

  const activeChips: { key: string; label: string; onRemove: () => void }[] =
    [];

  const zeroResultContext = useMemo(() => {
    if (search.trim()) return search.trim();
    if (typeFilter) return formatToolType(typeFilter);
    if (teamFilter) return teamFilter;
    if (activeKit) return activeKit.name;
    return "";
  }, [search, typeFilter, teamFilter, activeKit]);

  function toggleTeam(team: Team) {
    setTeamFilter((prev) => (prev === team ? "" : team));
  }

  function clearFilters() {
    setSearch("");
    setTeamFilter("");
    if (registryTab === "blocks") {
      navigateRegistry("/registry?tab=blocks");
      return;
    }
    navigateRegistry(typeFilter ? `/registry?type=${typeFilter}` : "/registry");
  }

  const toolsTabHref = typeFilter
    ? `/registry?type=${typeFilter}`
    : "/registry";

  if (typeFilter) {
    activeChips.push({
      key: "type",
      label: formatToolType(typeFilter),
      onRemove: () => navigateRegistry("/registry"),
    });
  }
  if (teamFilter) {
    activeChips.push({
      key: "team",
      label: teamFilter,
      onRemove: () => setTeamFilter(""),
    });
  }
  if (activeKit) {
    activeChips.push({
      key: "kit",
      label: activeKit.name,
      onRemove: () => navigateRegistry("/registry"),
    });
  }

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">
            {activeCategory && (typeFilter || registryTab === "blocks")
              ? activeCategory.label
              : "Tool registry"}
          </h1>
          <p className="page-header__desc t-para-md">
            {registryTab === "blocks"
              ? "Reusable APIs, services, agents, and frameworks at Headout."
              : typeFilter
                ? `${formatToolType(typeFilter)} in the catalogue — reuse before you build.`
                : "Browse tools and building blocks at Headout — reuse before you build."}
          </p>
        </div>
        <ButtonLink href="/" variant="primary">
          Open chat
        </ButtonLink>
      </div>

      <div className="registry-tabs" role="tablist" aria-label="Registry view">
        <button
          type="button"
          role="tab"
          aria-selected={registryTab === "tools"}
          className={`registry-tabs__btn t-label-rg${registryTab === "tools" ? " registry-tabs__btn--active" : ""}`}
          onClick={() => navigateRegistry(toolsTabHref)}
        >
          Tools
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={registryTab === "blocks"}
          className={`registry-tabs__btn t-label-rg${registryTab === "blocks" ? " registry-tabs__btn--active" : ""}`}
          onClick={() => navigateRegistry("/registry?tab=blocks")}
        >
          Building blocks
        </button>
      </div>

      <div className="registry-layout">
        <aside
          className={`registry-sidebar${mobileFiltersOpen ? " registry-sidebar--open" : ""}`}
        >
          <div className="registry-sidebar__header">
            <h2 className="registry-sidebar__title t-heading-sm">Filters</h2>
            <button
              type="button"
              className="registry-sidebar__close"
              onClick={() => setMobileFiltersOpen(false)}
              aria-label="Close filters"
            >
              <Icon name="cross" size={18} />
            </button>
          </div>

          <div className="registry-sidebar__section">
            <h3 className="registry-sidebar__label t-label-rg-heavy">Team</h3>
            <div className="registry-sidebar__options">
              {TEAMS.map((team) => (
                <button
                  key={team}
                  type="button"
                  className={`registry-filter-btn t-label-rg${
                    teamFilter === team ? " registry-filter-btn--active" : ""
                  }`}
                  onClick={() => toggleTeam(team)}
                >
                  {team}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="registry-sidebar__clear t-cta-sm"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </aside>

        <div className="registry-main">
          <div className="registry-toolbar">
            <div className="registry-toolbar__search">
              <Icon name="search" size={18} className="registry-toolbar__icon" />
              <input
                type="search"
                className="registry-toolbar__input t-para-rg"
                placeholder="Search tools…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search registry"
              />
            </div>
            <div className="registry-toolbar__actions">
              <button
                type="button"
                className="registry-toolbar__filters-btn t-label-rg"
                onClick={() => setMobileFiltersOpen(true)}
              >
                Filters
              </button>
              {registryTab === "tools" && (
                <select
                  className="registry-toolbar__sort t-para-rg"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as RegistrySort)}
                  aria-label="Sort tools"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {activeChips.length > 0 && registryTab === "tools" && (
            <div className="filter-chips">
              {activeChips.map((chip) => (
                <span key={chip.key} className="filter-chip t-label-sm">
                  {chip.label}
                  <button
                    type="button"
                    className="filter-chip__remove"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    <Icon name="cross" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {registryTab === "blocks" ? (
            filteredBlocks.length > 0 ? (
              <div className="building-block-grid">
                {filteredBlocks.map((block) => (
                  <BuildingBlockCard key={block.id} block={block} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="globe"
                title="No building blocks found"
                description="Try a different search — blocks are reusable APIs, services, agents, and frameworks."
              />
            )
          ) : filtered.length > 0 ? (
            <div className="registry-grid">
              {filtered.map((tool) => (
                <ToolCard key={tool.id} tool={tool} variant="catalog" />
              ))}
            </div>
          ) : hasActiveFilters ? (
            <ZeroResultsPanel
              query={zeroResultContext}
              kits={getClosestKits(zeroResultContext)}
              leadMessage={
                search
                  ? undefined
                  : `Nothing matched your filters${zeroResultContext ? ` (${zeroResultContext})` : ""} — try these next steps instead of stopping here.`
              }
            />
          ) : (
            <EmptyState
              icon="globe"
              title={
                hasActiveFilters
                  ? "No tools found"
                  : "Nothing here yet — be the first to register a tool"
              }
              description={
                hasActiveFilters
                  ? "Nothing matched your filters. Try clearing filters or broadening your search."
                  : "The registry is empty. Register what you've built so others can find it."
              }
              action={
                <ButtonLink href="/" variant="primary">
                  Open chat
                </ButtonLink>
              }
            />
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <button
          type="button"
          className="registry-sidebar-backdrop"
          aria-label="Close filters"
          onClick={() => setMobileFiltersOpen(false)}
        />
      )}
    </>
  );
}

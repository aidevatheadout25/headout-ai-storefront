"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToolCard } from "@/components/ToolCard";
import { EmptyState } from "@/components/EmptyState";
import { ZeroResultsPanel } from "@/components/ZeroResultsPanel";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { filterRegistryTools, getClosestKits } from "@/lib/askBar";
import { filterBuildingBlocks, filterRegistryNeeds } from "@/lib/funnel";
import { getKitById } from "@/lib/mockData";
import { sortRegistryTools, type RegistrySort } from "@/lib/registry";
import { BuildingBlockCard } from "@/components/BuildingBlockCard";
import { RequestCard } from "@/components/RequestCard";
import {
  TEAMS,
  TOOL_TYPES,
  formatToolType,
  type Team,
  type ToolType,
} from "@/lib/types";

const SORT_OPTIONS: { value: RegistrySort; label: string }[] = [
  { value: "most-used", label: "Most used" },
  { value: "recent", label: "Recently added" },
  { value: "a-z", label: "A–Z" },
];

export function RegistryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { approvedTools, buildingBlocks, requests } = useApp();
  const kitParam = searchParams.get("kit") ?? "";
  const tabParam = searchParams.get("tab") ?? "tools";
  const registryTab =
    tabParam === "blocks"
      ? "blocks"
      : tabParam === "needs"
        ? "needs"
        : "tools";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sort, setSort] = useState<RegistrySort>("most-used");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeKit = kitParam ? getKitById(kitParam) : undefined;

  const filteredBlocks = useMemo(
    () => filterBuildingBlocks(buildingBlocks, search),
    [buildingBlocks, search],
  );

  const filteredNeeds = useMemo(
    () => filterRegistryNeeds(requests, search),
    [requests, search],
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
    if (activeKit) return activeKit.name;
    if (typeFilter) return formatToolType(typeFilter as ToolType);
    if (teamFilter) return teamFilter;
    return "";
  }, [search, activeKit, typeFilter, teamFilter]);

  if (search) {
    activeChips.push({
      key: "search",
      label: `Search: ${search}`,
      onRemove: () => setSearch(""),
    });
  }
  if (typeFilter) {
    activeChips.push({
      key: "type",
      label: formatToolType(typeFilter as ToolType),
      onRemove: () => setTypeFilter(""),
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
      label: `Kit: ${activeKit.name}`,
      onRemove: () => router.push("/registry"),
    });
  }

  function toggleType(type: ToolType) {
    setTypeFilter((current) => (current === type ? "" : type));
  }

  function toggleTeam(team: Team) {
    setTeamFilter((current) => (current === team ? "" : team));
  }

  function clearAllFilters() {
    setSearch("");
    setTypeFilter("");
    setTeamFilter("");
    if (activeKit) {
      router.push("/registry");
      return;
    }
  }

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Tool registry</h1>
          <p className="page-header__desc t-para-md">
            Browse tools, building blocks, and open or parked needs at Headout.
          </p>
        </div>
        <ButtonLink href="/funnel" variant="primary">
          Guided intake
        </ButtonLink>
      </div>

      <div className="registry-tabs" role="tablist" aria-label="Registry view">
        <button
          type="button"
          role="tab"
          aria-selected={registryTab === "tools"}
          className={`registry-tabs__btn t-label-rg${registryTab === "tools" ? " registry-tabs__btn--active" : ""}`}
          onClick={() => router.push("/registry")}
        >
          Tools
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={registryTab === "blocks"}
          className={`registry-tabs__btn t-label-rg${registryTab === "blocks" ? " registry-tabs__btn--active" : ""}`}
          onClick={() => router.push("/registry?tab=blocks")}
        >
          Building blocks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={registryTab === "needs"}
          className={`registry-tabs__btn t-label-rg${registryTab === "needs" ? " registry-tabs__btn--active" : ""}`}
          onClick={() => router.push("/registry?tab=needs")}
        >
          Needs
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
            <h3 className="registry-sidebar__label t-label-rg-heavy">Type</h3>
            <div className="registry-sidebar__options">
              {TOOL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`registry-filter-btn t-label-rg${
                    typeFilter === type ? " registry-filter-btn--active" : ""
                  }`}
                  onClick={() => toggleType(type)}
                >
                  {formatToolType(type)}
                </button>
              ))}
            </div>
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
              className="registry-sidebar__clear t-para-sm text-link"
              onClick={clearAllFilters}
            >
              Clear all filters
            </button>
          )}
        </aside>

        <div className="registry-main">
          <div className="registry-toolbar">
            <div className="registry-toolbar__search">
              <Icon name="globe" size={18} className="registry-toolbar__icon" />
              <input
                type="search"
                className="registry-toolbar__input t-para-rg"
                placeholder={
                  registryTab === "needs"
                    ? "Search needs, parked reasons, source queries…"
                    : "Search tools, tags, owners..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search registry"
              />
            </div>

            <button
              type="button"
              className="registry-toolbar__filters-btn btn btn--secondary btn--sm t-cta-sm"
              onClick={() => setMobileFiltersOpen(true)}
            >
              Filters
            </button>

            <div className="registry-toolbar__meta">
              <span className="registry-toolbar__count t-label-rg-heavy">
                {registryTab === "blocks"
                  ? `${filteredBlocks.length} block${filteredBlocks.length === 1 ? "" : "s"}`
                  : registryTab === "needs"
                    ? `${filteredNeeds.length} need${filteredNeeds.length === 1 ? "" : "s"}`
                    : `${filtered.length} tool${filtered.length === 1 ? "" : "s"}`}
              </span>
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
          ) : registryTab === "needs" ? (
            filteredNeeds.length > 0 ? (
              <ul className="request-list">
                {filteredNeeds.map((request) => (
                  <li key={request.id} id={request.id}>
                    <RequestCard request={request} compact />
                  </li>
                ))}
              </ul>
            ) : search.trim() ? (
              <EmptyState
                icon="bulb"
                title="No needs found"
                description="Try different words — open and parked needs are searchable here."
                action={
                  <ButtonLink href="/funnel" variant="primary">
                    Post a new need
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                icon="bulb"
                title="No needs yet"
                description="Open and parked needs from guided intake appear here."
                action={
                  <ButtonLink href="/funnel" variant="primary">
                    Figure out a need
                  </ButtonLink>
                }
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
                <ButtonLink href="/funnel" variant="primary">
                  Figure out a need
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

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToolCard } from "@/components/ToolCard";
import { EmptyState } from "@/components/EmptyState";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { filterRegistryTools } from "@/lib/askBar";
import { getKitById } from "@/lib/mockData";
import { sortRegistryTools, type RegistrySort } from "@/lib/registry";
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
  const { approvedTools, canSubmit } = useApp();
  const kitParam = searchParams.get("kit") ?? "";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sort, setSort] = useState<RegistrySort>("most-used");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeKit = kitParam ? getKitById(kitParam) : undefined;

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
            Browse every internal tool, skill, MCP, and bot at Headout.
          </p>
        </div>
        {canSubmit && (
          <ButtonLink href="/submit" variant="primary">
            Submit a tool
          </ButtonLink>
        )}
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
                placeholder="Search tools, tags, owners..."
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
                {filtered.length} tool{filtered.length === 1 ? "" : "s"}
              </span>
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
            </div>
          </div>

          {activeChips.length > 0 && (
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

          {filtered.length > 0 ? (
            <div className="registry-grid">
              {filtered.map((tool) => (
                <ToolCard key={tool.id} tool={tool} variant="catalog" />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="globe"
              title="No tools found"
              description={
                hasActiveFilters
                  ? "Nothing matched your search or filters."
                  : "The registry is empty. Be the first to submit a tool."
              }
              action={
                canSubmit ? (
                  <ButtonLink href="/submit" variant="primary">
                    Want to register one?
                  </ButtonLink>
                ) : undefined
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

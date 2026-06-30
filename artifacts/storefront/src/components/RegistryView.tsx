import { useEffect, useMemo, useState } from "react";
import { ToolCard } from "@/components/ToolCard";
import { EmptyState } from "@/components/EmptyState";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useRegistryNavigation } from "@/hooks/useRegistryNavigation";
import { fetchTools } from "@/lib/api";
import { ErrorState } from "@/components/ErrorState";
import type { RegistryUrlParams } from "@/lib/registryNav";
import {
  TEAMS,
  formatToolType,
  normalizeCatalogueTypeParam,
  type Team,
  type Tool,
} from "@/lib/types";
import { buildZepsBuilderUrl } from "@/lib/zeps";

type RegistrySort = "recent" | "a-z";

const SORT_OPTIONS: { value: RegistrySort; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "a-z", label: "A–Z" },
];

type RegistryViewProps = {
  urlParams: RegistryUrlParams;
};

function matchesSearch(tool: Tool, query: string): boolean {
  if (!query) return true;
  const haystack = [
    tool.name,
    tool.oneLiner,
    tool.description,
    tool.team,
    tool.owner.name,
    ...tool.tags,
    ...tool.types,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function RegistryView({ urlParams }: RegistryViewProps) {
  const navigateRegistry = useRegistryNavigation();
  const typeFilter = normalizeCatalogueTypeParam(urlParams.type ?? "");

  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(urlParams.q ?? "");
  const [teamFilter, setTeamFilter] = useState("");
  const [sort, setSort] = useState<RegistrySort>("recent");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setSearch(urlParams.q ?? "");
  }, [urlParams.q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchTools(typeFilter || undefined)
      .then((result) => {
        if (!cancelled) setTools(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter, reloadKey]);

  const filtered = useMemo(() => {
    const results = tools.filter(
      (tool) =>
        matchesSearch(tool, search.trim()) &&
        (!teamFilter || tool.team === teamFilter),
    );
    const sorted = [...results];
    if (sort === "a-z") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
      );
    }
    return sorted;
  }, [tools, search, teamFilter, sort]);

  const hasActiveFilters = Boolean(search.trim() || typeFilter || teamFilter);

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
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

  function toggleTeam(team: Team) {
    setTeamFilter((prev) => (prev === team ? "" : team));
  }

  function clearFilters() {
    setSearch("");
    setTeamFilter("");
    navigateRegistry(typeFilter ? `/registry?type=${typeFilter}` : "/registry");
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">
            {typeFilter ? formatToolType(typeFilter) : "Tool registry"}
          </h1>
          <p className="page-header__desc t-para-md">
            {typeFilter
              ? `${formatToolType(typeFilter)} in the catalogue — reuse before you build.`
              : "Browse the internal AI tools at Headout — reuse before you build."}
          </p>
        </div>
        <ButtonLink href="/" variant="primary">
          Open chat
        </ButtonLink>
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

          {loading ? (
            <EmptyState
              icon="hourglass"
              title="Loading tools…"
              description="Fetching the catalogue."
            />
          ) : loadError ? (
            <ErrorState
              title="Couldn't load the catalogue"
              message="Something went wrong fetching tools. Try again."
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          ) : filtered.length > 0 ? (
            <div className="registry-grid">
              {filtered.map((tool) => (
                <ToolCard key={tool.id} tool={tool} variant="catalog" />
              ))}
            </div>
          ) : search.trim() ? (
            <EmptyState
              icon="globe"
              title="No tools found"
              description="Nothing matches — build it with Zeps."
              action={
                <ButtonLink
                  href={buildZepsBuilderUrl({ prompt: search.trim() })}
                  variant="primary"
                  external
                >
                  Build with Zeps
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              icon="globe"
              title="No tools here yet"
              description="Nothing matched your filters. Try clearing filters or broadening your search."
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

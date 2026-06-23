"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { ZeroResultsPanel } from "@/components/ZeroResultsPanel";
import { useApp } from "@/context/AppContext";
import { getClosestKits, resolveAskQuery, buildFunnelUrl } from "@/lib/askBar";
import type { AskResult } from "@/lib/types";

const SEARCH_ERROR_TRIGGER = "!!error!!";

export function AskBar() {
  const searchParams = useSearchParams();
  const { approvedTools, recordZeroResultSearch } = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  function runSearch(searchQuery: string) {
    if (
      searchParams.get("demo") === "search-error" ||
      searchQuery.trim().toLowerCase() === SEARCH_ERROR_TRIGGER
    ) {
      setSearchError(true);
      setSubmitted(true);
      setResult(null);
      setLastQuery(searchQuery);
      return;
    }

    setSearchError(false);
    const resolved = resolveAskQuery(searchQuery, approvedTools);
    if (
      resolved.type === "fallback" &&
      resolved.reason === "no-match"
    ) {
      recordZeroResultSearch(searchQuery);
    }
    setResult(resolved);
    setSubmitted(true);
    setLastQuery(searchQuery);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  return (
    <div className="ask-bar">
      <p className="ask-bar__scope t-label-sm">
        <span className="ask-bar__scope-badge t-tag-sm">Tool search</span>
        Ask in plain language or keywords — not org-knowledge Q&amp;A.
      </p>

      <form className="ask-bar__form" onSubmit={handleSubmit}>
        <div className="ask-bar__input-wrap ask-bar__input-wrap--primary">
          <Icon name="search" size={20} className="ask-bar__icon" />
          <input
            type="search"
            className="ask-bar__input t-para-md"
            placeholder="Search tools — 'viator scraper', 'pricing MCP', 'content QA bot'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tools"
          />
          <Button type="submit" size="sm" className="ask-bar__submit">
            Search
          </Button>
        </div>
      </form>

      {submitted && searchError && (
        <ErrorState
          title="Search unavailable"
          message="We couldn't run that search right now. This is a mocked error — try again."
          onRetry={() => {
            setSearchError(false);
            runSearch(lastQuery || query);
          }}
        />
      )}

      {submitted && !searchError && result && (
        <div className="ask-bar__results">
          {result.type === "tools" && (
            <>
              <p className="ask-bar__results-heading t-subheading-rg">
                Found {result.tools.length} tool
                {result.tools.length === 1 ? "" : "s"} for &ldquo;{result.query}&rdquo;
              </p>
              <div className="tool-grid tool-grid--compact">
                {result.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
              <Link
                href={`/registry?q=${encodeURIComponent(result.query)}`}
                className="ask-bar__view-all t-para-rg text-link"
              >
                View all in registry
              </Link>
              <p className="ask-bar__funnel-hint t-para-sm">
                Not what you need?{" "}
                <Link
                  href={buildFunnelUrl(result.query)}
                  className="text-link t-cta-sm"
                >
                  Start guided intake
                </Link>
                {" — "}reuse check, validate, then post a need.
              </p>
            </>
          )}

          {result.type === "fallback" && result.reason === "gibberish" && (
            <ZeroResultsPanel
              query={result.query}
              kits={getClosestKits(result.query)}
              leadMessage="Try describing the problem in plain words — then start guided intake to validate before posting a need."
            />
          )}

          {result.type === "fallback" && result.reason === "no-match" && (
            <ZeroResultsPanel
              query={result.query}
              kits={getClosestKits(result.query)}
            />
          )}
        </div>
      )}
    </div>
  );
}

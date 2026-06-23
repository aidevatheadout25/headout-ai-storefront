"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { Button, ButtonLink } from "@/components/Button";
import { useApp } from "@/context/AppContext";
import { resolveAskQuery } from "@/lib/askBar";
import type { AskResult } from "@/lib/types";

export function AskBar() {
  const { approvedTools, canSubmit } = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setResult(resolveAskQuery(query, approvedTools));
  }

  return (
    <div className="ask-bar">
      <form className="ask-bar__form" onSubmit={handleSubmit}>
        <div className="ask-bar__input-wrap ask-bar__input-wrap--primary">
          <Icon name="search" size={20} className="ask-bar__icon" />
          <input
            type="search"
            className="ask-bar__input t-para-md"
            placeholder="Search tools or ask a question — 'find a scraper', 'how do I get BigQuery access?'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tools or ask a question"
          />
          <Button type="submit" size="sm" className="ask-bar__submit">
            Search
          </Button>
        </div>
      </form>

      {submitted && result && (
        <div className="ask-bar__results">
          {result.type === "tools" && (
            <>
              <p className="ask-bar__results-heading t-subheading-rg">
                {result.tools.length > 0
                  ? `Found ${result.tools.length} tool${result.tools.length === 1 ? "" : "s"} for "${result.query}"`
                  : `No tools found for "${result.query}"`}
              </p>
              {result.tools.length > 0 ? (
                <>
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
                </>
              ) : (
                <div className="ask-bar__zero-results">
                  <p className="ask-bar__fallback t-para-md">
                    No tools found — want to register one?
                  </p>
                  {canSubmit ? (
                    <ButtonLink href="/submit" variant="primary" size="sm">
                      Submit a tool
                    </ButtonLink>
                  ) : (
                    <p className="t-para-sm text-muted">
                      Ask a builder on your team to register it, or switch to
                      Builder role in the header.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {result.type === "knowledge" && (
            <div className="ask-bar__knowledge">
              <p className="ask-bar__results-heading t-subheading-rg">
                Answer for &ldquo;{result.query}&rdquo;
              </p>
              <p className="ask-bar__answer t-para-md">{result.answer}</p>
              <div className="ask-bar__sources">
                <span className="ask-bar__sources-label t-label-rg-heavy">
                  Source{result.sources.length === 1 ? "" : "s"}
                </span>
                <ul className="ask-bar__sources-list">
                  {result.sources.map((source) => (
                    <li key={source.label}>
                      <Link href={source.url} className="text-link t-para-rg">
                        {source.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {result.type === "fallback" && (
            <div className="ask-bar__fallback-card">
              <Icon name="bulb" size={24} className="ask-bar__fallback-icon" />
              <p className="t-para-md">{result.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

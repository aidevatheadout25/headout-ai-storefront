"use client";

import { useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { computeAdminMetrics } from "@/lib/adminMetrics";
import { formatLifecycleStatus } from "@/lib/toolMeta";
import type { ToolLifecycleStatus } from "@/lib/types";

const STATUS_ORDER: ToolLifecycleStatus[] = [
  "live",
  "beta",
  "planned",
  "deprecated",
  "archived",
];

export function AdminMetricsView() {
  const { allTools, zeroResultSearchCount, canApprove } = useApp();

  const metrics = useMemo(
    () => computeAdminMetrics(allTools, zeroResultSearchCount),
    [allTools, zeroResultSearchCount],
  );

  if (!canApprove) {
    return (
      <EmptyState
        icon="shield-tick"
        title="Admin access required"
        description="Switch to Admin role in the header to view metrics."
      />
    );
  }

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Admin metrics</h1>
          <p className="page-header__desc t-para-md">
            Mocked catalog health — keyword search signals and submission
            volume. No leaderboards or public scores.
          </p>
        </div>
        <Link href="/admin/approvals" className="btn btn--secondary btn--sm t-cta-sm">
          Approval queue
        </Link>
      </div>

      <div className="metrics-grid">
        <article className="stat-card tool-card">
          <span className="stat-card__label t-label-rg-heavy">Total tools</span>
          <p className="stat-card__value t-display-xs">{metrics.totalTools}</p>
          <p className="stat-card__hint t-para-sm text-muted">Approved catalog entries</p>
        </article>

        <article className="stat-card tool-card">
          <span className="stat-card__label t-label-rg-heavy">Submissions this week</span>
          <p className="stat-card__value t-display-xs">{metrics.submissionsThisWeek}</p>
          <p className="stat-card__hint t-para-sm text-muted">Ideas + go-live reviews</p>
        </article>

        <article className="stat-card tool-card stat-card--demo">
          <div className="stat-card__header-row">
            <span className="stat-card__label t-label-rg-heavy">Zero-result searches</span>
            <span className="demo-data-badge t-tag-sm">Demo data</span>
          </div>
          <p className="stat-card__value t-display-xs">{metrics.zeroResultsCount}</p>
          <p className="stat-card__hint t-para-sm text-muted">
            Illustrative count — not live telemetry
          </p>
        </article>
      </div>

      <section className="metrics-section">
        <h2 className="metrics-section__title t-heading-sm">By status</h2>
        <ul className="metrics-status-list">
          {STATUS_ORDER.map((status) => (
            <li key={status} className="metrics-status-row">
              <span className="t-para-rg">{formatLifecycleStatus(status)}</span>
              <span className="metrics-status-row__count t-label-rg-heavy">
                {metrics.statusBreakdown[status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="metrics-section">
        <div className="metrics-section__header">
          <h2 className="metrics-section__title t-heading-sm">Top zero-result queries</h2>
          <span className="demo-data-badge t-tag-sm">Demo data</span>
        </div>
        <p className="metrics-section__desc t-para-sm text-muted">
          Sample queries for the demo — not captured from live search sessions.
        </p>
        <ol className="metrics-query-list">
          {metrics.topZeroResultQueries.map((item, index) => (
            <li key={item.query} className="metrics-query-row">
              <span className="metrics-query-row__rank t-label-sm">{index + 1}</span>
              <span className="metrics-query-row__query t-para-rg">{item.query}</span>
              <span className="metrics-query-row__count t-label-rg-heavy">
                {item.count}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

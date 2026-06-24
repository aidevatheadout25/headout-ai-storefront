"use client";

import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { RequestCard } from "@/components/RequestCard";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { sortRequests } from "@/lib/requests";
import type { RequestBoardSort } from "@/lib/types";

const SORT_OPTIONS: { value: RequestBoardSort; label: string }[] = [
  { value: "demand", label: "Most upvoted" },
  { value: "recent", label: "Most recent" },
];

export function RequestsView() {
  const { requests, mockUsers, canClaimRequest } = useApp();
  const [sort, setSort] = useState<RequestBoardSort>("demand");

  const boardRequests = useMemo(
    () => requests.filter((r) => r.status !== "parked"),
    [requests],
  );
  const sorted = useMemo(
    () => sortRequests(boardRequests, sort, mockUsers),
    [boardRequests, sort, mockUsers],
  );

  return (
    <>
      <RoleBanner />

      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Requests board</h1>
          <p className="page-header__desc t-para-md">
            Demand from across Headout — upvote what matters, builders claim and
            build.
          </p>
        </div>
        <ButtonLink href="/funnel" variant="primary">
          Figure out a need
        </ButtonLink>
      </div>

      <div className="requests-toolbar">
        <span className="requests-toolbar__count t-label-rg-heavy">
          {sorted.length} request{sorted.length === 1 ? "" : "s"}
        </span>
        <select
          className="registry-toolbar__sort t-para-rg"
          value={sort}
          onChange={(e) => setSort(e.target.value as RequestBoardSort)}
          aria-label="Sort requests"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {canClaimRequest && (
        <p className="requests-board__hint t-para-sm text-muted">
          Claim open needs to continue through stack and approach — the planned
          tool writes back to the registry.
        </p>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon="bulb"
          title="No requests yet"
          description="Be the first to post a need through guided intake — or check back when teammates add demand."
          action={
            <ButtonLink href="/funnel" variant="primary">
              Figure out a need
            </ButtonLink>
          }
        />
      ) : (
        <ul className="request-list">
          {sorted.map((request) => (
            <li key={request.id} id={request.id}>
              <RequestCard request={request} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

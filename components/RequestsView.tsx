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
  const { requests, canClaimRequest } = useApp();
  const [sort, setSort] = useState<RequestBoardSort>("demand");

  const sorted = useMemo(() => sortRequests(requests, sort), [requests, sort]);

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
        <ButtonLink href="/file-need" variant="primary">
          File a need
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
          As a builder, you can claim open requests — we&apos;ll create a planned
          tool and link it back here.
        </p>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon="bulb"
          title="No requests yet"
          description="Be the first to file a need — or check back when teammates add demand."
          action={
            <ButtonLink href="/file-need" variant="primary">
              File a need
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

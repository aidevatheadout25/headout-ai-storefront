"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { useApp } from "@/context/AppContext";
import { findRequestDedupMatches } from "@/lib/mockRequests";
import { TEAMS, type RequestFormData } from "@/lib/types";

const EMPTY_FORM: RequestFormData = {
  title: "",
  problem: "",
  team: "Platform",
  tags: "",
};

export function RequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allTools, requests, fileRequest } = useApp();
  const [form, setForm] = useState<RequestFormData>(() => ({
    ...EMPTY_FORM,
    title: searchParams.get("title") ?? "",
    problem: searchParams.get("problem") ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState("");

  const dedup = findRequestDedupMatches(
    form.title,
    form.problem,
    requests,
    allTools,
  );
  const hasDedup = dedup.requests.length > 0 || dedup.tools.length > 0;

  function updateField<K extends keyof RequestFormData>(
    key: K,
    value: RequestFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = fileRequest(form);
    setSubmittedId(id);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="confirmation-card">
        <div className="confirmation-card__icon">
          <Icon name="bulb" size={32} />
        </div>
        <h2 className="confirmation-card__title t-heading-md">Need filed</h2>
        <p className="confirmation-card__desc t-para-md">
          <strong>{form.title}</strong> is on the requests board. Builders can
          claim it — you&apos;ll see status updates in my requests & submissions.
        </p>
        <div className="confirmation-card__actions">
          <Link href="/my-submissions" className="btn btn--primary btn--rg t-cta-rg">
            My requests & submissions
          </Link>
          <Link href="/requests" className="btn btn--secondary btn--rg t-cta-rg">
            View requests board
          </Link>
          <Link href={`/requests#${submittedId}`} className="btn btn--secondary btn--rg t-cta-rg">
            View this request
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="tool-form request-form" onSubmit={handleSubmit}>
      <p className="request-form__intro t-para-md text-muted">
        Describe demand — not a tool spec. No links or build details. Anyone at
        Headout can file a need.
      </p>

      <div className="form-field">
        <label htmlFor="req-title" className="form-field__label t-label-rg-heavy">
          Title
        </label>
        <input
          id="req-title"
          className="form-field__input t-para-rg"
          value={form.title}
          onChange={(e) => updateField("title", e.target.value)}
          placeholder="e.g. Bulk-resize campaign images"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="req-problem" className="form-field__label t-label-rg-heavy">
          The problem
        </label>
        <textarea
          id="req-problem"
          className="form-field__input form-field__textarea t-para-rg"
          rows={4}
          value={form.problem}
          onChange={(e) => updateField("problem", e.target.value)}
          placeholder="What are you trying to do? Who needs it? Why now?"
          required
        />
      </div>

      {hasDedup && (
        <div className="dedup-nudge">
          <div className="dedup-nudge__header">
            <Icon name="info-circle" size={20} />
            <span className="t-subheading-rg">This may already exist</span>
          </div>
          <p className="dedup-nudge__desc t-para-sm">
            Matches include open requests and live tools — non-blocking.
          </p>
          {dedup.requests.length > 0 && (
            <ul className="dedup-nudge__request-list">
              {dedup.requests.map((r) => (
                <li key={r.id} className="dedup-nudge__request-item t-para-rg">
                  <Link href={`/requests#${r.id}`} className="text-link">
                    {r.title}
                  </Link>
                  <span className="text-muted"> — already requested</span>
                </li>
              ))}
            </ul>
          )}
          {dedup.tools.length > 0 && (
            <div className="tool-grid tool-grid--compact">
              {dedup.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="req-team" className="form-field__label t-label-rg-heavy">
            Team
          </label>
          <select
            id="req-team"
            className="form-field__input form-field__select t-para-rg"
            value={form.team}
            onChange={(e) =>
              updateField("team", e.target.value as RequestFormData["team"])
            }
          >
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="req-tags" className="form-field__label t-label-rg-heavy">
          Tags
        </label>
        <input
          id="req-tags"
          className="form-field__input t-para-rg"
          value={form.tags}
          onChange={(e) => updateField("tags", e.target.value)}
          placeholder="campaigns, images, growth"
        />
      </div>

      <div className="tool-form__actions">
        <Button type="submit" variant="primary">
          File this need
        </Button>
        <button
          type="button"
          className="btn btn--secondary btn--rg t-cta-rg"
          onClick={() => router.push("/requests")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { findDedupMatches, MOCK_README_PREVIEW, DEMO_USER } from "@/lib/mockData";
import {
  LIFECYCLE_STATUSES,
  SUBMIT_LIFECYCLE_STATUSES,
  TEAMS,
  TOOL_TYPES,
  formatToolType,
  type ToolFormData,
  type ToolType,
} from "@/lib/types";
import { formatLifecycleStatus, isOwnerMatch } from "@/lib/toolMeta";
import { GATE_ELIGIBILITY_NOTE } from "@/lib/adminMetrics";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import Link from "next/link";
import type { ReactNode } from "react";

const EMPTY_FORM: ToolFormData = {
  name: "",
  oneLiner: "",
  types: ["app"],
  link: "",
  ownerName: "",
  ownerSlackId: "",
  team: "Platform",
  tags: "",
  accessLevel: "open",
  sensitive: false,
  writeCapable: false,
  githubUrl: "",
  description: "",
  ownerInstructions: "",
  status: "live",
};

type ToolFormProps = {
  mode: "create" | "edit" | "edit-pending" | "resubmit";
  initialData?: ToolFormData;
  toolId?: string;
};

export function ToolForm({ mode, initialData, toolId }: ToolFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allTools, submitTool, updateTool, updatePendingTool, resubmitRejectedTool } = useApp();
  const demoErrors = searchParams.get("demo") === "errors";
  const [form, setForm] = useState<ToolFormData>(() => {
    const base: ToolFormData = initialData ?? {
      ...EMPTY_FORM,
      ownerName: DEMO_USER.name,
      ownerSlackId: DEMO_USER.slackId,
      team: DEMO_USER.team,
    };

    if (!initialData && mode === "create") {
      const prefillStatus = searchParams.get("status");
      const prefillName = searchParams.get("name");
      const prefillOneLiner = searchParams.get("oneLiner");
      const prefillType = searchParams.get("type");
      const validTypes = TOOL_TYPES as readonly string[];
      const types =
        prefillType && validTypes.includes(prefillType)
          ? [prefillType as ToolType]
          : base.types;
      return {
        ...base,
        status: prefillStatus === "planned" ? "planned" : base.status,
        name: prefillName ?? base.name,
        oneLiner: prefillOneLiner ?? base.oneLiner,
        types,
      };
    }

    return base;
  });
  const [readmePulled, setReadmePulled] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isPlanned = form.status === "planned";
  const dedupMatches = findDedupMatches(form.name, form.oneLiner, allTools);
  const ownerIsSelf = isOwnerMatch(form.ownerSlackId, DEMO_USER.slackId);

  function updateField<K extends keyof ToolFormData>(
    key: K,
    value: ToolFormData[K],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "accessLevel" && value === "sensitive") {
        next.sensitive = true;
      }
      return next;
    });
  }

  function toggleType(type: ToolType) {
    setForm((prev) => {
      const has = prev.types.includes(type);
      const types = has
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type];
      return { ...prev, types: types.length > 0 ? types : [type] };
    });
  }

  function handleGithubBlur() {
    if (form.githubUrl.includes("github.com")) {
      setReadmePulled(true);
      if (!form.description) {
        updateField("description", MOCK_README_PREVIEW);
      }
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

    if (demoErrors && !submitAttempted) {
      setSubmitFailed(true);
      return;
    }

    setSubmitFailed(false);
    if (mode === "create") {
      submitTool(form);
      setSubmitted(true);
    } else if (toolId && mode === "resubmit") {
      resubmitRejectedTool(toolId, form);
      router.push("/my-submissions");
    } else if (toolId && mode === "edit-pending") {
      updatePendingTool(toolId, form);
      router.push(`/tools/${toolId}`);
    } else if (toolId) {
      updateTool(toolId, form);
      router.push(`/tools/${toolId}`);
    }
  }

  if (submitFailed) {
    return (
      <ErrorState
        title="Submission failed"
        message="We couldn't save your tool right now. This is a mocked error — try again."
        onRetry={() => {
          setSubmitFailed(false);
          setSubmitAttempted(false);
        }}
      />
    );
  }

  if (submitted && mode === "create") {
    return (
      <div className="confirmation-card">
        <div className="confirmation-card__icon">
          <Icon name={isPlanned ? "bulb" : "hourglass"} size={32} />
        </div>
        <h2 className="confirmation-card__title t-heading-md">
          {isPlanned ? "Idea submitted" : "Submitted for review"}
        </h2>
        <p className="confirmation-card__desc t-para-md">
          {isPlanned ? (
            <>
              <strong>{form.name}</strong> is in the idea queue for a quick
              admin review. Once published, others can find it and reach out on
              Slack.
            </>
          ) : (
            <>
              Your submission for <strong>{form.name}</strong> is queued for
              go-live review — an admin will check owner and link, not quality.
            </>
          )}
        </p>
        {!isPlanned && (
          <p className="gate-eligibility-note t-para-sm text-muted">
            {GATE_ELIGIBILITY_NOTE}
          </p>
        )}
        <div className="confirmation-card__actions">
          <ButtonLinkWrap href="/my-submissions" variant="primary">
            My requests & submissions
          </ButtonLinkWrap>
          <ButtonLinkWrap href="/registry" variant="secondary">
            Browse registry
          </ButtonLinkWrap>
          <ButtonLinkWrap href="/" variant="secondary">
            Back to home
          </ButtonLinkWrap>
        </div>
      </div>
    );
  }

  return (
    <form className="tool-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="name" className="form-field__label t-label-rg-heavy">
          Name
        </label>
        <input
          id="name"
          className="form-field__input t-para-rg"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. Viator availability scraper"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="oneLiner" className="form-field__label t-label-rg-heavy">
          One-liner
        </label>
        <input
          id="oneLiner"
          className="form-field__input t-para-rg"
          value={form.oneLiner}
          onChange={(e) => updateField("oneLiner", e.target.value)}
          placeholder="What does it do in one sentence?"
          required
        />
      </div>

      {dedupMatches.length > 0 && (
        <div className="dedup-nudge">
          <div className="dedup-nudge__header">
            <Icon name="info-circle" size={20} />
            <span className="t-subheading-rg">These might already do this</span>
          </div>
          <p className="dedup-nudge__desc t-para-sm">
            Matches include planned ideas and live tools — non-blocking.
          </p>
          <div className="tool-grid tool-grid--compact">
            {dedupMatches.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      )}

      <div className="form-field">
        <span className="form-field__label t-label-rg-heavy">Status</span>
        <p className="form-field__hint t-para-sm text-muted">
          {mode === "create"
            ? "How far along is this? Deprecated and archived are set later by the owner — not at submit time."
            : mode === "edit-pending"
              ? "Still in review — you can update details before an admin decides."
              : "Lifecycle after publish. Use Archive on the tool page to retire an entry."}
        </p>
        <div className="form-field__radios form-field__radios--wrap">
          {(mode === "create" || mode === "edit-pending"
            ? SUBMIT_LIFECYCLE_STATUSES
            : LIFECYCLE_STATUSES.filter((s) => s !== "archived")
          ).map((status) => (
            <label key={status} className="form-field__radio t-para-rg">
              <input
                type="radio"
                name="lifecycleStatus"
                checked={form.status === status}
                onChange={() => updateField("status", status)}
              />
              {formatLifecycleStatus(status)}
              {status === "planned" && mode === "create" ? " — register an idea" : ""}
            </label>
          ))}
        </div>
      </div>

      <div className="form-field">
        <span className="form-field__label t-label-rg-heavy">Types</span>
        <p className="form-field__hint t-para-sm text-muted">
          Select all that apply — a tool can be multiple types.
        </p>
        <div className="form-field__checkboxes">
          {TOOL_TYPES.map((type) => (
            <label key={type} className="form-field__checkbox t-para-rg">
              <input
                type="checkbox"
                checked={form.types.includes(type)}
                onChange={() => toggleType(type)}
              />
              {formatToolType(type)}
            </label>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="team" className="form-field__label t-label-rg-heavy">
            Team
          </label>
          <select
            id="team"
            className="form-field__input form-field__select t-para-rg"
            value={form.team}
            onChange={(e) =>
              updateField("team", e.target.value as ToolFormData["team"])
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
        <label htmlFor="link" className="form-field__label t-label-rg-heavy">
          Link{isPlanned ? " (optional for planned ideas)" : ""}
        </label>
        <input
          id="link"
          type="url"
          className="form-field__input t-para-rg"
          value={form.link}
          onChange={(e) => updateField("link", e.target.value)}
          placeholder={isPlanned ? "Add later when you have a URL" : "https://..."}
          required={!isPlanned}
        />
      </div>

      <div className="form-field">
        <label htmlFor="githubUrl" className="form-field__label t-label-rg-heavy">
          GitHub URL
        </label>
        <input
          id="githubUrl"
          type="url"
          className="form-field__input t-para-rg"
          value={form.githubUrl}
          onChange={(e) => updateField("githubUrl", e.target.value)}
          onBlur={handleGithubBlur}
          placeholder="https://github.com/headout/..."
        />
        {readmePulled && (
          <div className="readme-preview">
            <span className="readme-preview__badge t-tag-sm">
              <Icon name="checkmark" size={12} /> README auto-pulled
            </span>
            <pre className="readme-preview__content t-para-sm">
              {MOCK_README_PREVIEW}
            </pre>
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="ownerName" className="form-field__label t-label-rg-heavy">
            Owner name
          </label>
          <input
            id="ownerName"
            className="form-field__input t-para-rg"
            value={form.ownerName}
            onChange={(e) => updateField("ownerName", e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="ownerSlackId" className="form-field__label t-label-rg-heavy">
            Owner Slack ID
          </label>
          <input
            id="ownerSlackId"
            className="form-field__input t-para-rg"
            value={form.ownerSlackId}
            onChange={(e) => updateField("ownerSlackId", e.target.value)}
            placeholder="@alex.kim"
            required
          />
        </div>
      </div>

      {!ownerIsSelf && form.ownerSlackId.trim() && (
        <p className="owner-confirm-note t-para-sm">
          We&apos;ll ask <strong>{form.ownerName || form.ownerSlackId}</strong> to
          confirm.
        </p>
      )}

      <div className="form-field">
        <label
          htmlFor="ownerInstructions"
          className="form-field__label t-label-rg-heavy"
        >
          How to use / how to get access
        </label>
        <p className="form-field__hint t-para-sm text-muted">
          Help others self-serve — reduces Slack pings to you.
        </p>
        <textarea
          id="ownerInstructions"
          className="form-field__input form-field__textarea t-para-rg"
          rows={4}
          value={form.ownerInstructions}
          onChange={(e) => updateField("ownerInstructions", e.target.value)}
          placeholder="e.g. DM @you in #channel with your use case. Read-only access provisioned in 1 day."
        />
      </div>

      <div className="form-field">
        <label htmlFor="tags" className="form-field__label t-label-rg-heavy">
          Tags
        </label>
        <input
          id="tags"
          className="form-field__input t-para-rg"
          value={form.tags}
          onChange={(e) => updateField("tags", e.target.value)}
          placeholder="scraping, supply, viator"
        />
      </div>

      <div className="form-field">
        <span className="form-field__label t-label-rg-heavy">Access level</span>
        <div className="form-field__radios">
          <label className="form-field__radio t-para-rg">
            <input
              type="radio"
              name="accessLevel"
              checked={form.accessLevel === "open"}
              onChange={() => updateField("accessLevel", "open")}
            />
            Open — anyone at Headout
          </label>
          <label className="form-field__radio t-para-rg">
            <input
              type="radio"
              name="accessLevel"
              checked={form.accessLevel === "request"}
              onChange={() => updateField("accessLevel", "request")}
            />
            Request — contact owner for access
          </label>
          <label className="form-field__radio t-para-rg">
            <input
              type="radio"
              name="accessLevel"
              checked={form.accessLevel === "sensitive"}
              onChange={() => updateField("accessLevel", "sensitive")}
            />
            Sensitive — restricted data, logged access
          </label>
        </div>
        <label className="form-field__checkbox t-para-sm">
          <input
            type="checkbox"
            checked={form.writeCapable}
            onChange={(e) => updateField("writeCapable", e.target.checked)}
          />
          Write-capable (can modify data, not just read)
        </label>
        <label className="form-field__checkbox t-para-sm">
          <input
            type="checkbox"
            checked={form.sensitive}
            onChange={(e) => updateField("sensitive", e.target.checked)}
            disabled={form.accessLevel === "sensitive"}
          />
          Handles sensitive or restricted data
        </label>
      </div>

      <div className="form-field">
        <label htmlFor="description" className="form-field__label t-label-rg-heavy">
          Description
        </label>
        <textarea
          id="description"
          className="form-field__input form-field__textarea t-para-rg"
          rows={5}
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="What does it do, who is it for, how do you run it?"
        />
      </div>

      <div className="tool-form__actions">
        <Button type="submit" variant="primary">
          {mode === "create"
            ? isPlanned
              ? "Register idea"
              : "Submit for go-live review"
            : mode === "resubmit"
              ? "Resubmit for review"
              : mode === "edit-pending"
                ? "Save submission"
                : "Save changes"}
        </Button>
        <Link
          href={
            toolId && (mode === "edit" || mode === "edit-pending")
              ? `/tools/${toolId}`
              : "/registry"
          }
          className="btn btn--secondary btn--rg t-cta-rg"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function ButtonLinkWrap({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "primary" | "secondary" | "white";
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`btn btn--${variant} btn--rg t-cta-rg`}>
      {children}
    </Link>
  );
}

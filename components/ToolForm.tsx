"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { findDedupMatches, MOCK_README_PREVIEW } from "@/lib/mockData";
import { TEAMS, TOOL_TYPES, formatToolType, type ToolFormData } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import Link from "next/link";
import type { ReactNode } from "react";

const EMPTY_FORM: ToolFormData = {
  name: "",
  oneLiner: "",
  type: "app",
  link: "",
  ownerName: "",
  ownerSlackId: "",
  team: "Platform",
  tags: "",
  accessLevel: "open",
  githubUrl: "",
  description: "",
};

type ToolFormProps = {
  mode: "create" | "edit";
  initialData?: ToolFormData;
  toolId?: string;
};

export function ToolForm({ mode, initialData, toolId }: ToolFormProps) {
  const router = useRouter();
  const { approvedTools, submitTool, updateTool } = useApp();
  const [form, setForm] = useState<ToolFormData>(initialData ?? EMPTY_FORM);
  const [readmePulled, setReadmePulled] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const dedupMatches = findDedupMatches(
    form.name,
    form.oneLiner,
    approvedTools,
  );

  function updateField<K extends keyof ToolFormData>(
    key: K,
    value: ToolFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    if (mode === "create") {
      submitTool(form);
      setSubmitted(true);
    } else if (toolId) {
      updateTool(toolId, form);
      router.push(`/tools/${toolId}`);
    }
  }

  if (submitted && mode === "create") {
    return (
      <div className="confirmation-card">
        <div className="confirmation-card__icon">
          <Icon name="hourglass" size={32} />
        </div>
        <h2 className="confirmation-card__title t-heading-md">
          Pending approval
        </h2>
        <p className="confirmation-card__desc t-para-md">
          Your submission for <strong>{form.name}</strong> is in the queue. An
          admin will review it within 48 hours — you&apos;ll get a Slack ping
          when it&apos;s live.
        </p>
        <div className="confirmation-card__actions">
          <ButtonLinkWrap href="/registry" variant="primary">
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
            Non-blocking — you can still submit if yours is different.
          </p>
          <div className="tool-grid tool-grid--compact">
            {dedupMatches.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="type" className="form-field__label t-label-rg-heavy">
            Type
          </label>
          <select
            id="type"
            className="form-field__input form-field__select t-para-rg"
            value={form.type}
            onChange={(e) =>
              updateField("type", e.target.value as ToolFormData["type"])
            }
          >
            {TOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {formatToolType(t)}
              </option>
            ))}
          </select>
        </div>

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
          Link
        </label>
        <input
          id="link"
          type="url"
          className="form-field__input t-para-rg"
          value={form.link}
          onChange={(e) => updateField("link", e.target.value)}
          placeholder="https://..."
          required
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
              checked={form.accessLevel === "gated"}
              onChange={() => updateField("accessLevel", "gated")}
            />
            Gated — contact owner on Slack
          </label>
        </div>
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
          {mode === "create" ? "Submit for approval" : "Save changes"}
        </Button>
        <Link href={mode === "edit" && toolId ? `/tools/${toolId}` : "/registry"} className="btn btn--secondary btn--rg t-cta-rg">
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
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`btn btn--${variant} btn--rg t-cta-rg`}>
      {children}
    </Link>
  );
}

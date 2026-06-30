import { useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { claimTool, updateTool, ApiError } from "@/lib/api";
import type { ManageAuth, ToolPatch } from "@/lib/api";
import {
  getManageToken,
  setManageToken,
  clearManageToken,
} from "@/lib/manageTokens";
import {
  TOOL_TYPES,
  TEAMS,
  LIFECYCLE_STATUSES,
  formatToolType,
} from "@/lib/types";
import type { Tool, ToolType, Team, ToolLifecycleStatus } from "@/lib/types";
import { formatLifecycleStatus } from "@/lib/toolMeta";

const ACCESS_LEVELS = ["open", "request", "sensitive"] as const;

type ToolManagePanelProps = {
  tool: Tool;
  onUpdated: (tool: Tool) => void;
  onClose: () => void;
};

type Draft = {
  title: string;
  type: ToolType;
  oneLiner: string;
  description: string;
  tags: string;
  url: string;
  team: Team;
  status: ToolLifecycleStatus;
  accessLevel: (typeof ACCESS_LEVELS)[number];
  ownerName: string;
  ownerSlackId: string;
};

function toDraft(tool: Tool): Draft {
  return {
    title: tool.name,
    type: tool.types[0] ?? "app",
    oneLiner: tool.oneLiner,
    description: tool.description,
    tags: tool.tags.join(", "),
    url: tool.link,
    team: tool.team,
    status: tool.status,
    accessLevel: ACCESS_LEVELS.includes(
      tool.accessLevel as (typeof ACCESS_LEVELS)[number],
    )
      ? (tool.accessLevel as (typeof ACCESS_LEVELS)[number])
      : "open",
    ownerName: tool.owner.name === "Unknown" ? "" : tool.owner.name,
    ownerSlackId: tool.owner.slackId,
  };
}

function draftToPatch(draft: Draft): ToolPatch {
  return {
    title: draft.title.trim(),
    type: draft.type,
    oneLiner: draft.oneLiner.trim(),
    description: draft.description.trim(),
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    url: draft.url.trim(),
    team: draft.team,
    status: draft.status,
    accessLevel: draft.accessLevel,
    ownerName: draft.ownerName.trim(),
    ownerSlackId: draft.ownerSlackId.trim(),
  };
}

export function ToolManagePanel({
  tool,
  onUpdated,
  onClose,
}: ToolManagePanelProps) {
  const storedToken = getManageToken(tool.id);
  // Having a stored manage key means we can edit straight away.
  const [auth, setAuth] = useState<ManageAuth | null>(
    storedToken ? { manageToken: storedToken } : null,
  );

  // Gate inputs (shown until we have credentials).
  const [ownerName, setOwnerName] = useState(
    tool.owner.name === "Unknown" ? "" : tool.owner.name,
  );
  const [ownerSlackId, setOwnerSlackId] = useState(tool.owner.slackId);
  const [manageKeyInput, setManageKeyInput] = useState("");
  const [adminKeyInput, setAdminKeyInput] = useState("");

  const [draft, setDraft] = useState<Draft>(() => toDraft(tool));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const claimed = tool.claimed ?? false;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedOk(false);
  }

  async function handleClaim() {
    if (!ownerName.trim() || !ownerSlackId.trim()) {
      setError("Add your name and Slack handle to claim this tool.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await claimTool(tool.id, {
        ownerName: ownerName.trim(),
        ownerSlackId: ownerSlackId.trim(),
      });
      setManageToken(tool.id, result.manageToken);
      setIssuedKey(result.manageToken);
      setAuth({ manageToken: result.manageToken });
      setDraft(toDraft(result.tool));
      onUpdated(result.tool);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't claim this tool. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleUseManageKey() {
    const key = manageKeyInput.trim();
    if (!key) {
      setError("Paste your manage key to continue.");
      return;
    }
    setError(null);
    setManageToken(tool.id, key);
    setAuth({ manageToken: key });
  }

  function handleUseAdminKey() {
    const key = adminKeyInput.trim();
    if (!key) {
      setError("Paste the admin key to continue.");
      return;
    }
    setError(null);
    setAuth({ adminToken: key });
  }

  async function handleSave() {
    if (!auth) return;
    if (!draft.title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!draft.ownerName.trim() || !draft.ownerSlackId.trim()) {
      setError("Owner name and Slack handle are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSavedOk(false);
    try {
      const updated = await updateTool(tool.id, draftToPatch(draft), auth);
      setDraft(toDraft(updated));
      onUpdated(updated);
      setSavedOk(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        // Credentials no longer valid — drop them and re-gate.
        if (auth.manageToken) clearManageToken(tool.id);
        setAuth(null);
        setError("Those credentials weren't accepted. Re-authenticate to edit.");
      } else {
        setError(
          err instanceof ApiError ? err.message : "Couldn't save. Try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="manage-panel">
      <div className="manage-panel__head">
        <h2 className="detail-section__title t-heading-md">
          {auth ? "Edit this listing" : "Manage this listing"}
        </h2>
        <Button variant="tertiary" size="sm" onClick={onClose}>
          <Icon name="cross" size={16} />
          Close
        </Button>
      </div>

      {issuedKey && (
        <div className="manage-panel__keycard">
          <Icon name="shield-tick" size={20} />
          <div>
            <p className="t-label-rg-heavy">Save your manage key</p>
            <p className="t-para-sm text-muted">
              This is shown once. It&apos;s stored in this browser, but copy it
              somewhere safe so you can edit from anywhere.
            </p>
            <code className="manage-panel__key">{issuedKey}</code>
          </div>
        </div>
      )}

      {error && (
        <p className="manage-panel__error t-para-sm" role="alert">
          {error}
        </p>
      )}

      {!auth ? (
        <div className="manage-panel__gate">
          {!claimed ? (
            <div className="manage-panel__block">
              <p className="t-para-rg">
                No one owns this listing yet. Claim it to keep it accurate —
                you&apos;ll get a manage key for future edits.
              </p>
              <label className="form-field">
                <span className="form-field__label t-label-rg">Your name</span>
                <input
                  className="form-field__input t-para-rg"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Priya Nair"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label t-label-rg">
                  Slack handle
                </span>
                <input
                  className="form-field__input t-para-rg"
                  value={ownerSlackId}
                  onChange={(e) => setOwnerSlackId(e.target.value)}
                  placeholder="@priya"
                />
              </label>
              <Button variant="primary" size="rg" onClick={handleClaim} disabled={busy}>
                {busy ? "Claiming…" : "Claim ownership"}
              </Button>
            </div>
          ) : (
            <div className="manage-panel__block">
              <p className="t-para-rg">
                This listing is owned. Enter your manage key to edit it.
              </p>
              <label className="form-field">
                <span className="form-field__label t-label-rg">Manage key</span>
                <input
                  className="form-field__input t-para-rg"
                  value={manageKeyInput}
                  onChange={(e) => setManageKeyInput(e.target.value)}
                  placeholder="Paste your manage key"
                />
              </label>
              <Button
                variant="primary"
                size="rg"
                onClick={handleUseManageKey}
                disabled={busy}
              >
                Continue
              </Button>
            </div>
          )}

          <div className="manage-panel__divider">
            <span className="t-tag-sm text-muted">or</span>
          </div>

          <div className="manage-panel__block">
            <p className="t-para-sm text-muted">
              Admin? Use the admin key to manage any listing.
            </p>
            <label className="form-field">
              <span className="form-field__label t-label-rg">Admin key</span>
              <input
                className="form-field__input t-para-rg"
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                placeholder="Paste the admin key"
                type="password"
              />
            </label>
            <Button
              variant="secondary"
              size="rg"
              onClick={handleUseAdminKey}
              disabled={busy}
            >
              Continue as admin
            </Button>
          </div>
        </div>
      ) : (
        <div className="manage-panel__form">
          <label className="form-field">
            <span className="form-field__label t-label-rg">Title</span>
            <input
              className="form-field__input t-para-rg"
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>

          <div className="manage-panel__row">
            <label className="form-field">
              <span className="form-field__label t-label-rg">Type</span>
              <select
                className="form-field__input form-field__select t-para-rg"
                value={draft.type}
                onChange={(e) => update("type", e.target.value as ToolType)}
              >
                {TOOL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatToolType(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-field__label t-label-rg">Team</span>
              <select
                className="form-field__input form-field__select t-para-rg"
                value={draft.team}
                onChange={(e) => update("team", e.target.value as Team)}
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="form-field">
            <span className="form-field__label t-label-rg">One-liner</span>
            <input
              className="form-field__input t-para-rg"
              value={draft.oneLiner}
              onChange={(e) => update("oneLiner", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label t-label-rg">Description</span>
            <textarea
              className="form-field__input form-field__textarea t-para-rg"
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label t-label-rg">
              Tags (comma-separated)
            </span>
            <input
              className="form-field__input t-para-rg"
              value={draft.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="inventory, dashboard, supply"
            />
          </label>

          <label className="form-field">
            <span className="form-field__label t-label-rg">Link</span>
            <input
              className="form-field__input t-para-rg"
              value={draft.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="https://…"
            />
          </label>

          <div className="manage-panel__row">
            <label className="form-field">
              <span className="form-field__label t-label-rg">Lifecycle</span>
              <select
                className="form-field__input form-field__select t-para-rg"
                value={draft.status}
                onChange={(e) =>
                  update("status", e.target.value as ToolLifecycleStatus)
                }
              >
                {LIFECYCLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatLifecycleStatus(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-field__label t-label-rg">Access</span>
              <select
                className="form-field__input form-field__select t-para-rg"
                value={draft.accessLevel}
                onChange={(e) =>
                  update(
                    "accessLevel",
                    e.target.value as (typeof ACCESS_LEVELS)[number],
                  )
                }
              >
                {ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="manage-panel__row">
            <label className="form-field">
              <span className="form-field__label t-label-rg">Owner name</span>
              <input
                className="form-field__input t-para-rg"
                value={draft.ownerName}
                onChange={(e) => update("ownerName", e.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label t-label-rg">
                Owner Slack handle
              </span>
              <input
                className="form-field__input t-para-rg"
                value={draft.ownerSlackId}
                onChange={(e) => update("ownerSlackId", e.target.value)}
              />
            </label>
          </div>

          <div className="manage-panel__actions">
            <Button variant="primary" size="rg" onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            {savedOk && (
              <span className="manage-panel__saved t-para-sm">
                <Icon name="checkmark" size={16} /> Saved — search updated
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

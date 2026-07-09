import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrief, scaffoldRepo, updateBrief, type BriefPayload, type Modality, type ScaffoldResult } from "@/lib/api";
import { Button, ButtonLink } from "@/components/Button";
import { buildZepsBuilderUrl } from "@/lib/zeps";

type Props = {
  brief: BriefPayload;
  onScaffold: (result: ScaffoldResult) => void;
};

function FieldInput({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div className="brief-card__field">
        <label className="brief-card__label t-label-sm">{label}</label>
        <textarea
          className="brief-card__textarea t-para-sm"
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="brief-card__field">
      <label className="brief-card__label t-label-sm">{label}</label>
      <input
        className="brief-card__input t-para-sm"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  const text = items.join("\n");
  return (
    <div className="brief-card__field">
      <label className="brief-card__label t-label-sm">{label}</label>
      <textarea
        className="brief-card__textarea t-para-sm"
        value={text}
        rows={3}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

export function BriefCard({ brief: initialBrief, onScaffold }: Props) {
  const [brief, setBrief] = useState<BriefPayload>(initialBrief);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [scaffolding, setScaffolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist on mount
  useEffect(() => {
    createBrief(initialBrief)
      .then((res) => setBriefId(res.brief.id))
      .catch(() => {});
  }, []);

  const handleChange = useCallback(
    <K extends keyof BriefPayload>(key: K, value: BriefPayload[K]) => {
      setBrief((prev) => {
        const next = { ...prev, [key]: value };
        // Debounced save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (briefId) {
            updateBrief(briefId, { [key]: value }).catch(() => {});
          }
        }, 600);
        return next;
      });
    },
    [briefId],
  );

  const handleCreateRepo = useCallback(async () => {
    if (!briefId) return;
    setScaffolding(true);
    setError(null);
    try {
      const result = await scaffoldRepo(briefId);
      onScaffold(result);
    } catch {
      setError("Couldn't create the repo — try again.");
    } finally {
      setScaffolding(false);
    }
  }, [briefId, onScaffold]);

  const isZep = brief.modality === "zep";

  // A zep isn't a repo — it's built conversationally on Zeps. Deeplink into
  // the Zeps builder with the scoped need prefilled instead of scaffolding.
  const zepsBuilderUrl = useMemo(() => {
    if (!isZep) return null;
    const promptParts = [
      brief.problem,
      brief.mustDo.length > 0 ? `Must do: ${brief.mustDo.join("; ")}` : null,
      brief.wontDo.length > 0 ? `Won't do: ${brief.wontDo.join("; ")}` : null,
    ].filter((part): part is string => Boolean(part && part.trim()));
    return buildZepsBuilderUrl({
      name: brief.title,
      prompt: promptParts.join("\n\n"),
      source: "storefront",
    });
  }, [isZep, brief.title, brief.problem, brief.mustDo, brief.wontDo]);

  return (
    <div className="brief-card">
      <div className="brief-card__header">
        <span className="brief-card__title t-heading-sm">Requirements brief</span>
        <span className="brief-card__note t-label-sm">
          {isZep
            ? "Edit any field, then open it in the Zeps builder."
            : "Edit any field, then create your repo."}
        </span>
      </div>

      <div className="brief-card__body">
        <FieldInput
          label="Tool name (2–4 words)"
          value={brief.title ?? ""}
          onChange={(v) => handleChange("title", v)}
        />
        <FieldInput
          label="Problem"
          value={brief.problem}
          onChange={(v) => handleChange("problem", v)}
          multiline
        />
        <FieldInput
          label="Who uses it?"
          value={brief.users}
          onChange={(v) => handleChange("users", v)}
        />
        <FieldInput
          label="How often?"
          value={brief.frequency}
          onChange={(v) => handleChange("frequency", v)}
        />
        <ListField
          label="Must do (one per line)"
          items={brief.mustDo}
          onChange={(v) => handleChange("mustDo", v)}
        />
        <ListField
          label="Won't do (one per line)"
          items={brief.wontDo}
          onChange={(v) => handleChange("wontDo", v)}
        />
        <div className="brief-card__row">
          <div className="brief-card__field brief-card__field--inline">
            <label className="brief-card__label t-label-sm">Modality</label>
            <select
              className="brief-card__select t-para-sm"
              value={brief.modality}
              onChange={(e) => handleChange("modality", e.target.value as Modality)}
            >
              <option value="skill">Claude skill (text-in, artifact-out, no hosting)</option>
              <option value="mcp">MCP server (machine-callable, no UI)</option>
              <option value="zep">Zep (no-code workflow agent on Zeps)</option>
              <option value="script">Script (one-off / dev-side automation)</option>
              <option value="micro_app">Micro app (small UI + backend, one job)</option>
              <option value="full_app">Full app (multi-user, multiple integrations)</option>
            </select>
          </div>
          <div className="brief-card__field brief-card__field--inline">
            <label className="brief-card__label t-label-sm">Risk</label>
            <select
              className="brief-card__select t-para-sm"
              value={brief.risk}
              onChange={(e) =>
                handleChange("risk", e.target.value as "low" | "high")
              }
            >
              <option value="low">Low (internal, non-sensitive data)</option>
              <option value="high">High (PII, financial, regulated, or customer-facing)</option>
            </select>
          </div>
        </div>
        <FieldInput
          label="Why this modality?"
          value={brief.modalityReason}
          onChange={(v) => handleChange("modalityReason", v)}
        />
      </div>

      {error && <p className="brief-card__error t-para-sm">{error}</p>}

      <div className="brief-card__footer">
        {isZep ? (
          <ButtonLink href={zepsBuilderUrl ?? "#"} variant="primary" external>
            Open in Zeps builder →
          </ButtonLink>
        ) : (
          <Button
            type="button"
            onClick={() => void handleCreateRepo()}
            disabled={scaffolding || !briefId}
          >
            {scaffolding ? "Creating repo…" : "Create my repo"}
          </Button>
        )}
      </div>
    </div>
  );
}

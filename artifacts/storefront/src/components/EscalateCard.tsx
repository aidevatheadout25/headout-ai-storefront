import type { EscalatePayload } from "@/lib/api";

type Props = {
  escalate: EscalatePayload;
};

/**
 * Shown when the critique agent calls escalate_to_eng — the idea is too
 * large or load-bearing for any self-serve path. Reuses the kill-card visual
 * treatment (same CSS classes) since this is structurally the same shape: a
 * terminal, non-brief outcome with a short explanation, no repo/checklist.
 */
export function EscalateCard({ escalate }: Props) {
  return (
    <div className="kill-card">
      <div className="kill-card__header">
        <span className="kill-card__icon" aria-hidden="true">🏗️</span>
        <span className="kill-card__title t-heading-sm">Needs an engineering team</span>
      </div>
      <p className="kill-card__reason t-para-sm">{escalate.whyLoadBearing}</p>
      <div className="kill-card__alternative">
        <p className="kill-card__alt-label t-label-sm">Project pitch</p>
        <p className="kill-card__alt-text t-para-sm">{escalate.problem}</p>
        <p className="kill-card__alt-text t-para-sm">
          <strong>Suggested owning team(s):</strong> {escalate.suggestedOwningTeams}
        </p>
        <p className="kill-card__alt-text t-para-sm">
          <strong>Rough shape:</strong> {escalate.roughShape}
        </p>
      </div>
    </div>
  );
}

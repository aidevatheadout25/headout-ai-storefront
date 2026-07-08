import { useEffect, useState } from "react";
import { submitReview, type ReviewEvent, type ReviewResult } from "@/lib/api";
import { ButtonLink } from "@/components/Button";

type Props = {
  buildId: string;
  onLive: (result: ReviewResult) => void;
};

const STAGES_ORDER = ["ci", "secrets", "auth", "security", "human", "deploy"];

const STAGE_LABELS: Record<string, string> = {
  ci: "Running CI checks",
  secrets: "Scanning for secrets",
  auth: "Verifying auth rules",
  security: "Security policy check",
  human: "Human sign-off",
  deploy: "Deploy + smoke test",
};

export function ReviewCard({ buildId, onLive }: Props) {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await submitReview(buildId);
        if (cancelled) return;
        // Animate events one by one with a small delay
        for (let i = 0; i < res.events.length; i++) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 350));
          if (cancelled) return;
          setEvents((prev) => [...prev, res.events[i]]);
        }
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;
        setResult(res);
        onLive(res);
      } catch {
        if (!cancelled) setError("Review failed — please try again.");
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [buildId, onLive]);

  const visibleStages = STAGES_ORDER.filter((s) =>
    events.some((e) => e.stage === s),
  );

  return (
    <div className="review-card">
      <div className="review-card__header">
        <span className="review-card__badge t-label-xs">SIMULATED</span>
        <span className="review-card__title t-heading-sm">
          {result ? "Review passed 🎉" : "Running review…"}
        </span>
      </div>

      <ul className="review-card__stages">
        {STAGES_ORDER.map((stage) => {
          const done = events.some((e) => e.stage === stage);
          const visible = done || visibleStages.length > 0;
          return (
            <li
              key={stage}
              className={`review-card__stage ${done ? "review-card__stage--done" : ""} ${!visible ? "review-card__stage--pending" : ""}`}
            >
              <span className="review-card__stage-icon" aria-hidden="true">
                {done ? "✓" : "·"}
              </span>
              <span className="review-card__stage-label t-para-sm">
                {STAGE_LABELS[stage] ?? stage}
              </span>
            </li>
          );
        })}
      </ul>

      {error && <p className="review-card__error t-para-sm">{error}</p>}

      {result && (
        <div className="review-card__ceremony">
          <p className="review-card__ceremony-text t-para-sm">
            <strong>{result.toolName}</strong> is now live in the catalogue and
            immediately findable via semantic search.
          </p>
          <div className="review-card__ceremony-actions">
            <ButtonLink href={`/tools/${result.toolId}`} variant="primary" size="sm">
              View your tool →
            </ButtonLink>
            <ButtonLink
              href={`/?q=${encodeURIComponent(result.toolName)}`}
              variant="secondary"
              size="sm"
            >
              Try searching for it
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}

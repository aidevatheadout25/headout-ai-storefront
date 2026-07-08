import type { KillPayload } from "@/lib/api";
import { ButtonLink } from "@/components/Button";

type Props = {
  kill: KillPayload;
};

export function KillCard({ kill }: Props) {
  return (
    <div className="kill-card">
      <div className="kill-card__header">
        <span className="kill-card__icon" aria-hidden="true">🚫</span>
        <span className="kill-card__title t-heading-sm">Not a build — yet</span>
      </div>
      <p className="kill-card__reason t-para-sm">{kill.reason}</p>
      <div className="kill-card__alternative">
        <p className="kill-card__alt-label t-label-sm">Instead, do this now:</p>
        <p className="kill-card__alt-text t-para-sm">{kill.alternative}</p>
        {kill.alternativeUrl && (
          <ButtonLink
            href={kill.alternativeUrl}
            variant="primary"
            size="sm"
            external={!kill.alternativeUrl.startsWith("/")}
          >
            Open →
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

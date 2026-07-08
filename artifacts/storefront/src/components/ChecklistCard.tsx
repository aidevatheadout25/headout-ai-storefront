import { useCallback, useEffect, useState } from "react";
import { verifyStep } from "@/lib/api";
import { Button } from "@/components/Button";

const STEPS = [
  { label: "Set up the repo locally and run the starter code", help: "I'm getting a setup error — can you help?" },
  { label: "Wire in the required Headout APIs or data sources", help: "I'm stuck connecting to the Headout API." },
  { label: "Implement the core logic from the brief's must-dos", help: "I'm not sure how to implement the main logic." },
  { label: "Write a basic test and confirm it passes locally", help: "I'm having trouble writing tests for this." },
];

type Props = {
  buildId: string;
  onDone: () => void;
  onHelp: (text: string) => void;
};

function getStorageKey(buildId: string) {
  return `checklist-${buildId}`;
}

function loadState(buildId: string): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(getStorageKey(buildId));
    return raw ? (JSON.parse(raw) as Record<number, boolean>) : {};
  } catch {
    return {};
  }
}

function saveState(buildId: string, state: Record<number, boolean>) {
  try {
    localStorage.setItem(getStorageKey(buildId), JSON.stringify(state));
  } catch {}
}

export function ChecklistCard({ buildId, onDone, onHelp }: Props) {
  const [verified, setVerified] = useState<Record<number, boolean>>(() =>
    loadState(buildId),
  );
  const [verifying, setVerifying] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const allDone = STEPS.every((_, i) => verified[i]);

  useEffect(() => {
    if (allDone) onDone();
  }, [allDone, onDone]);

  const handleVerify = useCallback(
    async (step: 0 | 1 | 2 | 3) => {
      setVerifying((prev) => ({ ...prev, [step]: true }));
      setError(null);
      try {
        await verifyStep(buildId, step);
        const next = { ...verified, [step]: true };
        setVerified(next);
        saveState(buildId, next);
      } catch {
        setError("Verification failed — try again.");
      } finally {
        setVerifying((prev) => ({ ...prev, [step]: false }));
      }
    },
    [buildId, verified],
  );

  return (
    <div className="checklist-card">
      <div className="checklist-card__header">
        <span className="checklist-card__badge t-label-xs">SIMULATED</span>
        <span className="checklist-card__title t-heading-sm">Builder checklist</span>
      </div>
      <ol className="checklist-card__steps">
        {STEPS.map((step, i) => {
          const done = Boolean(verified[i]);
          const prevDone = i === 0 || Boolean(verified[i - 1]);
          const locked = !prevDone && !done;
          return (
            <li
              key={i}
              className={`checklist-card__step ${done ? "checklist-card__step--done" : ""} ${locked ? "checklist-card__step--locked" : ""}`}
            >
              <div className="checklist-card__step-top">
                <span className="checklist-card__step-num t-label-sm">{i + 1}</span>
                <span className="checklist-card__step-label t-para-sm">{step.label}</span>
                {done && (
                  <span className="checklist-card__step-tick" aria-label="Done">
                    ✓
                  </span>
                )}
              </div>
              {!done && !locked && (
                <div className="checklist-card__step-actions">
                  <Button
                    type="button"
                    size="sm"
                    disabled={verifying[i]}
                    onClick={() => void handleVerify(i as 0 | 1 | 2 | 3)}
                  >
                    {verifying[i] ? "Checking…" : "I did this — verify"}
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={() => onHelp(step.help)}
                  >
                    I'm stuck
                  </Button>
                </div>
              )}
              {locked && (
                <p className="checklist-card__locked-msg t-label-sm">
                  Complete step {i} first
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {error && <p className="checklist-card__error t-para-sm">{error}</p>}
    </div>
  );
}

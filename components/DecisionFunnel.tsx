"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BuildingBlockCard } from "@/components/BuildingBlockCard";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import {
  GOLDEN_PATH_STACK,
  approachNeedsHardGate,
  buildPrerequisitesHaystack,
  computeStakesLevel,
  findNearDuplicateRequests,
  hardGateReason,
  isGoldenPathStack,
  matchFunnelReuse,
  recommendApproach,
  stackNeedsHardGate,
} from "@/lib/funnel";
import { DECISION_RULES } from "@/lib/mockDecisionRules";
import type {
  ChosenApproach,
  ChosenStack,
  FunnelStage,
  RequestPrerequisites,
  RequestValidation,
  Team,
  ToolType,
} from "@/lib/types";
import { TEAMS, formatToolType } from "@/lib/types";

const EMPTY_PREREQ: RequestPrerequisites = {
  dataSources: "",
  systems: "",
  inputsOutputs: "",
  touchesPII: false,
  touchesPayments: false,
  usesLLM: false,
  needsExternalDep: false,
};

const STAGE_LABELS: { id: FunnelStage; label: string; step: number }[] = [
  { id: "prerequisites", label: "Prerequisites", step: 2 },
  { id: "validate", label: "Validate", step: 3 },
  { id: "stack", label: "Tech stack", step: 4 },
  { id: "approach", label: "Approach", step: 5 },
];

type FunnelUiStage = FunnelStage | "reuse-check" | "parked" | "viewer-done";

export function DecisionFunnel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const requestIdParam = searchParams.get("requestId") ?? "";

  const {
    approvedTools,
    buildingBlocks,
    requests,
    currentUser,
    role,
    canSubmitTool,
    getRequestById,
    createValidatedRequest,
    parkNeed,
    completeBuilderFunnel,
    upvoteRequest,
  } = useApp();

  const claimedRequest = requestIdParam ? getRequestById(requestIdParam) : undefined;
  const isBuilderContinuation = Boolean(
    claimedRequest &&
      claimedRequest.status === "claimed" &&
      claimedRequest.claimedById === currentUser.id &&
      !claimedRequest.linkedToolId,
  );

  const [title, setTitle] = useState(
    () => claimedRequest?.title ?? initialQuery,
  );
  const [team, setTeam] = useState<Team>(
    () => claimedRequest?.team ?? currentUser.team,
  );
  const [prerequisites, setPrerequisites] = useState<RequestPrerequisites>(
    () => claimedRequest?.prerequisites ?? { ...EMPTY_PREREQ },
  );
  const [validation, setValidation] = useState<RequestValidation>(() => ({
    problem:
      claimedRequest?.validation?.problem ??
      claimedRequest?.problem ??
      (initialQuery ? `Looking for something that ${initialQuery}` : ""),
    whoHasIt: claimedRequest?.validation?.whoHasIt ?? "",
    frequency: claimedRequest?.validation?.frequency ?? "",
    currentWorkaround: claimedRequest?.validation?.currentWorkaround ?? "",
    expectedValue: claimedRequest?.validation?.expectedValue ?? "",
  }));
  const [stage, setStage] = useState<FunnelUiStage>(() =>
    isBuilderContinuation ? "stack" : "prerequisites",
  );
  const [reuseMatches, setReuseMatches] = useState<ReturnType<
    typeof matchFunnelReuse
  > | null>(null);
  const [stakesLevel, setStakesLevel] = useState(
    () =>
      claimedRequest?.stakesLevel ??
      (claimedRequest?.prerequisites
        ? computeStakesLevel(claimedRequest.prerequisites)
        : "low"),
  );
  const [stack, setStack] = useState<ChosenStack>({ ...GOLDEN_PATH_STACK });
  const [stackJustification, setStackJustification] = useState("");
  const [approach, setApproach] = useState<ChosenApproach | null>(null);
  const [approachJustification, setApproachJustification] = useState("");
  const [parkReason, setParkReason] = useState("");
  const [createdRequestId, setCreatedRequestId] = useState("");
  const [duplicateRequests, setDuplicateRequests] = useState<
    ReturnType<typeof findNearDuplicateRequests>
  >([]);

  const recommendedApproach = useMemo(
    () => recommendApproach(prerequisites, validation),
    [prerequisites, validation],
  );

  const activeApproach = approach ?? recommendedApproach;
  const stackGate = stackNeedsHardGate(stakesLevel, stack);
  const approachGate = approachNeedsHardGate(
    stakesLevel,
    activeApproach,
    recommendedApproach.form,
  );

  const demandSignal = useMemo(() => {
    const haystack = `${title} ${validation.problem}`.toLowerCase();
    return requests
      .filter((r) => r.status === "open" && r.id !== claimedRequest?.id)
      .filter((r) => {
        const h = `${r.title} ${r.problem}`.toLowerCase();
        return haystack.split(/\s+/).some((w) => w.length > 3 && h.includes(w));
      })
      .slice(0, 3);
  }, [requests, title, validation.problem, claimedRequest?.id]);

  function updatePrereq<K extends keyof RequestPrerequisites>(
    key: K,
    value: RequestPrerequisites[K],
  ) {
    setPrerequisites((prev) => ({ ...prev, [key]: value }));
  }

  function updateValidation<K extends keyof RequestValidation>(
    key: K,
    value: RequestValidation[K],
  ) {
    setValidation((prev) => ({ ...prev, [key]: value }));
  }

  function handlePrerequisitesContinue() {
    const level = computeStakesLevel(prerequisites);
    setStakesLevel(level);
    const haystack = `${title} ${buildPrerequisitesHaystack(prerequisites)}`;
    setReuseMatches(matchFunnelReuse(haystack, approvedTools, buildingBlocks));
    setStage("reuse-check");
  }

  function handleContinueToValidate() {
    setStage("validate");
  }

  function handleValidatePass() {
    const dupes = findNearDuplicateRequests(validation, title, requests);
    if (dupes.length > 0 && !isBuilderContinuation) {
      setDuplicateRequests(dupes);
      return;
    }

    if (isBuilderContinuation && requestIdParam) {
      setApproach(recommendedApproach);
      setStage("stack");
      return;
    }

    if (canSubmitTool) {
      const id = createValidatedRequest({
        title,
        team,
        tags: title.toLowerCase().split(/\s+/).slice(0, 4),
        sourceQuery: initialQuery || undefined,
        prerequisites,
        validation,
        stakesLevel,
      });
      setCreatedRequestId(id);
      setApproach(recommendedApproach);
      setStage("stack");
      return;
    }

    const id = createValidatedRequest({
      title,
      team,
      tags: title.toLowerCase().split(/\s+/).slice(0, 4),
      sourceQuery: initialQuery || undefined,
      prerequisites,
      validation,
      stakesLevel,
    });
    setCreatedRequestId(id);
    setStage("viewer-done");
  }

  function handlePark() {
    if (!parkReason.trim()) return;
    parkNeed({
      title: title || "Unnamed need",
      reason: parkReason.trim(),
      sourceQuery: initialQuery || undefined,
      prerequisites,
      validation,
    });
    setStage("parked");
  }

  function handleStackContinue() {
    if (stackGate && !stackJustification.trim()) return;
    setApproach(recommendedApproach);
    setStage("approach");
  }

  function handleFinishBuilder() {
    const targetRequestId = requestIdParam || createdRequestId;
    if (!targetRequestId) return;

    const finalStack: ChosenStack = {
      ...stack,
      justification: stackGate ? stackJustification.trim() : undefined,
      needsAdminSignoff: stackGate,
    };
    const finalApproach: ChosenApproach = {
      ...activeApproach,
      override: activeApproach.form !== recommendedApproach.form,
      justification: approachGate ? approachJustification.trim() : undefined,
    };

    if (approachGate && !approachJustification.trim()) return;

    const toolId = completeBuilderFunnel(
      targetRequestId,
      finalStack,
      finalApproach,
    );
    if (toolId) {
      router.push(`/tools/${toolId}`);
    }
  }

  const visibleStages = canSubmitTool || isBuilderContinuation
    ? STAGE_LABELS
    : STAGE_LABELS.filter((s) => s.step <= 3);

  const currentStep =
    stage === "reuse-check"
      ? 2
      : stage === "viewer-done" || stage === "parked"
        ? 3
        : STAGE_LABELS.find((s) => s.id === stage)?.step ?? 2;

  return (
    <>
      <RoleBanner />

      <div className="funnel">
        <header className="funnel__header">
          <div>
            <h1 className="funnel__title t-display-xs">
              {isBuilderContinuation
                ? "Continue build — stack & approach"
                : "Figure out what you need"}
            </h1>
            <p className="funnel__desc t-para-md">
              Earn the right to build — reuse first, validate demand, then stack
              and approach for builders.
            </p>
          </div>
          <Link href="/" className="funnel__close t-cta-sm text-link">
            <Icon name="cross" size={16} />
            Exit
          </Link>
        </header>

        <ol className="funnel-progress" aria-label="Funnel progress">
          {visibleStages.map((item) => {
            const done = item.step < currentStep;
            const active = item.step === currentStep;
            return (
              <li
                key={item.id}
                className={`funnel-progress__item${done ? " funnel-progress__item--done" : ""}${active ? " funnel-progress__item--active" : ""}`}
              >
                <span className="funnel-progress__step t-label-sm">
                  {item.step}
                </span>
                <span className="funnel-progress__label t-label-rg">
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>

        {stage === "prerequisites" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">
              Stage 2 · What does it touch?
            </h2>
            <p className="funnel-stage__intro t-para-rg">
              Quick scan — we&apos;ll check for existing tools and internal
              building blocks before you go further.
            </p>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Need title</span>
              <input
                className="form-field__input t-para-rg"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bulk-resize campaign images"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Data sources</span>
              <input
                className="form-field__input t-para-rg"
                value={prerequisites.dataSources}
                onChange={(e) => updatePrereq("dataSources", e.target.value)}
                placeholder="Figma exports, BigQuery tables, Slack messages…"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Systems involved</span>
              <input
                className="form-field__input t-para-rg"
                value={prerequisites.systems}
                onChange={(e) => updatePrereq("systems", e.target.value)}
                placeholder="CMS, Growth workflow, supplier APIs…"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Inputs → outputs</span>
              <input
                className="form-field__input t-para-rg"
                value={prerequisites.inputsOutputs}
                onChange={(e) => updatePrereq("inputsOutputs", e.target.value)}
                placeholder="Upload images → resized assets per city spec"
              />
            </label>

            <fieldset className="funnel-toggles">
              <legend className="t-label-rg">Risk toggles</legend>
              {(
                [
                  ["touchesPII", "Touches PII"],
                  ["touchesPayments", "Touches payments"],
                  ["usesLLM", "Uses LLM"],
                  ["needsExternalDep", "New external dependency"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="funnel-toggle">
                  <input
                    type="checkbox"
                    checked={prerequisites[key]}
                    onChange={(e) => updatePrereq(key, e.target.checked)}
                  />
                  <span className="t-para-rg">{label}</span>
                </label>
              ))}
            </fieldset>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Team</span>
              <select
                className="form-field__input form-field__select t-para-rg"
                value={team}
                onChange={(e) => setTeam(e.target.value as Team)}
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handlePrerequisitesContinue}
                disabled={!title.trim()}
              >
                Continue
              </Button>
            </div>
          </section>
        )}

        {stage === "reuse-check" && reuseMatches && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">
              Reuse check
            </h2>

            {reuseMatches.tools.length > 0 && (
              <div className="funnel-reuse-block funnel-reuse-block--alert">
                <p className="t-subheading-rg">This may already exist</p>
                <div className="tool-grid tool-grid--compact">
                  {reuseMatches.tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
                <ButtonLink href={`/tools/${reuseMatches.tools[0].id}`} variant="primary" size="sm">
                  Use existing tool
                </ButtonLink>
              </div>
            )}

            {reuseMatches.blocks.length > 0 && (
              <div className="funnel-reuse-block">
                <p className="t-subheading-rg">Use these internal pieces</p>
                <div className="building-block-grid">
                  {reuseMatches.blocks.map((block) => (
                    <BuildingBlockCard key={block.id} block={block} compact />
                  ))}
                </div>
              </div>
            )}

            {reuseMatches.rules.length > 0 && (
              <ul className="funnel-rules">
                {reuseMatches.rules.map((rule) => (
                  <li key={rule.id} className="funnel-rules__item t-para-rg">
                    <Icon name="info-circle" size={16} />
                    <span>
                      {rule.message}
                      {rule.stakes === "high" && (
                        <span className="funnel-rules__stakes t-tag-sm">
                          High stakes
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {reuseMatches.tools.length === 0 &&
              reuseMatches.blocks.length === 0 &&
              reuseMatches.rules.length === 0 && (
                <p className="t-para-rg text-muted">
                  No close matches — continue to validate the need.
                </p>
              )}

            <div className="funnel-stage__actions">
              <Button variant="primary" onClick={handleContinueToValidate}>
                Continue to validate
              </Button>
            </div>
          </section>
        )}

        {stage === "validate" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">
              Stage 3 · Validate the need
            </h2>

            {demandSignal.length > 0 && (
              <div className="funnel-demand">
                <p className="funnel-demand__title t-subheading-rg">
                  Demand signal — similar open requests
                </p>
                <ul className="funnel-demand__list">
                  {demandSignal.map((req) => (
                    <li key={req.id} className="funnel-demand__item t-para-rg">
                      <strong>{req.title}</strong> — {req.upvotes} upvote
                      {req.upvotes === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {duplicateRequests.length > 0 && (
              <div className="funnel-reuse-block funnel-reuse-block--alert">
                <p className="t-subheading-rg">Near-duplicate request found</p>
                <ul className="funnel-demand__list">
                  {duplicateRequests.map((req) => (
                    <li key={req.id} className="funnel-demand__item">
                      <p className="t-para-rg">
                        <strong>{req.title}</strong> — {req.upvotes} upvotes
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          upvoteRequest(req.id);
                          router.push("/requests");
                        }}
                      >
                        Upvote that instead
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="form-field">
              <span className="form-field__label t-label-rg">The problem</span>
              <textarea
                className="form-field__input form-field__textarea t-para-rg"
                rows={3}
                value={validation.problem}
                onChange={(e) => updateValidation("problem", e.target.value)}
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Who has it?</span>
              <input
                className="form-field__input t-para-rg"
                value={validation.whoHasIt}
                onChange={(e) => updateValidation("whoHasIt", e.target.value)}
                placeholder="Team, role, how many people"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">How often?</span>
              <input
                className="form-field__input t-para-rg"
                value={validation.frequency}
                onChange={(e) => updateValidation("frequency", e.target.value)}
                placeholder="Daily, weekly, every launch…"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Current workaround</span>
              <input
                className="form-field__input t-para-rg"
                value={validation.currentWorkaround}
                onChange={(e) =>
                  updateValidation("currentWorkaround", e.target.value)
                }
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Expected value</span>
              <input
                className="form-field__input t-para-rg"
                value={validation.expectedValue}
                onChange={(e) => updateValidation("expectedValue", e.target.value)}
                placeholder="Time saved, fewer errors, faster launches…"
              />
            </label>

            <div className="funnel-park">
              <p className="t-label-rg">Not worth pursuing?</p>
              <textarea
                className="form-field__input form-field__textarea t-para-rg"
                rows={2}
                value={parkReason}
                onChange={(e) => setParkReason(e.target.value)}
                placeholder="Park reason — captured for search, not a dead end"
              />
              <Button variant="secondary" size="sm" onClick={handlePark}>
                Park / decline
              </Button>
            </div>

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handleValidatePass}
                disabled={
                  !validation.problem.trim() ||
                  !validation.whoHasIt.trim() ||
                  duplicateRequests.length > 0
                }
              >
                {canSubmitTool || isBuilderContinuation
                  ? "Validated — continue to stack"
                  : "Post validated need"}
              </Button>
            </div>
          </section>
        )}

        {stage === "viewer-done" && (
          <section className="funnel-stage funnel-stage--done">
            <div className="confirmation-card">
              <div className="confirmation-card__icon">
                <Icon name="checkmark" size={32} />
              </div>
              <h2 className="confirmation-card__title t-heading-md">
                Need validated and posted
              </h2>
              <p className="confirmation-card__desc t-para-md">
                <strong>{title}</strong> is on the requests board with prerequisites
                and demand captured. A builder can claim it and continue through
                stack and approach.
              </p>
              {stakesLevel === "high" && (
                <p className="funnel-gate-note t-para-sm">
                  {hardGateReason(stakesLevel, stack, prerequisites)}
                </p>
              )}
              <div className="confirmation-card__actions">
                <ButtonLink href="/requests" variant="primary">
                  View requests board
                </ButtonLink>
                <ButtonLink href={`/requests#${createdRequestId}`} variant="secondary">
                  View this request
                </ButtonLink>
              </div>
            </div>
          </section>
        )}

        {stage === "parked" && (
          <section className="funnel-stage funnel-stage--done">
            <div className="confirmation-card">
              <h2 className="confirmation-card__title t-heading-md">Need parked</h2>
              <p className="confirmation-card__desc t-para-md">
                Captured with your reason — searchable later, not a dead end.
              </p>
              <ButtonLink href="/registry" variant="primary">
                Back to registry
              </ButtonLink>
            </div>
          </section>
        )}

        {stage === "stack" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">
              Stage 4 · Tech stack
            </h2>
            <p className="funnel-stage__intro t-para-rg">
              Golden path pre-selected. Low-stakes — edit freely. High-stakes or
              off-path — justify before continuing.
            </p>

            <div className="funnel-stack-default">
              <span className="t-tag-sm">Golden path</span>
              <p className="t-para-rg">
                {GOLDEN_PATH_STACK.framework} + {GOLDEN_PATH_STACK.hosting} +{" "}
                {GOLDEN_PATH_STACK.auth}
              </p>
            </div>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Framework</span>
              <input
                className="form-field__input t-para-rg"
                value={stack.framework}
                onChange={(e) =>
                  setStack((prev) => ({ ...prev, framework: e.target.value }))
                }
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Hosting</span>
              <input
                className="form-field__input t-para-rg"
                value={stack.hosting}
                onChange={(e) =>
                  setStack((prev) => ({ ...prev, hosting: e.target.value }))
                }
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">Auth</span>
              <input
                className="form-field__input t-para-rg"
                value={stack.auth}
                onChange={(e) =>
                  setStack((prev) => ({ ...prev, auth: e.target.value }))
                }
              />
            </label>

            {stackGate && (
              <div className="funnel-hard-gate">
                <p className="funnel-gate-note t-para-sm">
                  {hardGateReason(stakesLevel, stack, prerequisites)}
                </p>
                <label className="form-field">
                  <span className="form-field__label t-label-rg">
                    Justification (required)
                  </span>
                  <textarea
                    className="form-field__input form-field__textarea t-para-rg"
                    rows={3}
                    value={stackJustification}
                    onChange={(e) => setStackJustification(e.target.value)}
                    placeholder="Why deviate from golden path or proceed on high stakes?"
                  />
                </label>
                <p className="t-para-sm text-muted" role="status">
                  Admin sign-off needed — mocked for demo.
                </p>
              </div>
            )}

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handleStackContinue}
                disabled={stackGate && !stackJustification.trim()}
              >
                Continue to approach
              </Button>
            </div>
          </section>
        )}

        {stage === "approach" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">
              Stage 5 · Approach
            </h2>

            <div className="funnel-approach-rec">
              <Icon name="spark" size={20} />
              <p className="t-para-rg">{recommendedApproach.recommendation}</p>
              <span className="t-tag-rg">
                Recommended: {formatToolType(recommendedApproach.form)}
              </span>
            </div>

            <fieldset className="form-field__radios">
              <legend className="form-field__label t-label-rg">Confirm form</legend>
              {(["app", "skill", "mcp"] as ToolType[]).map((form) => (
                <label key={form} className="form-field__radio">
                  <input
                    type="radio"
                    name="approach"
                    checked={activeApproach.form === form}
                    onChange={() =>
                      setApproach({
                        ...recommendedApproach,
                        form,
                        override: form !== recommendedApproach.form,
                      })
                    }
                  />
                  <span className="t-para-rg">{formatToolType(form)}</span>
                </label>
              ))}
            </fieldset>

            {approachGate && (
              <div className="funnel-hard-gate">
                <p className="funnel-gate-note t-para-sm">
                  Why this is gated: high-stakes override on recommended approach.
                </p>
                <label className="form-field">
                  <span className="form-field__label t-label-rg">
                    Override justification
                  </span>
                  <textarea
                    className="form-field__input form-field__textarea t-para-rg"
                    rows={2}
                    value={approachJustification}
                    onChange={(e) => setApproachJustification(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handleFinishBuilder}
                disabled={approachGate && !approachJustification.trim()}
              >
                Finish — write planned tool to registry
              </Button>
            </div>
          </section>
        )}

        <p className="funnel-footnote t-para-sm text-muted">
          Decision rules loaded: {DECISION_RULES.length} seeded policies (mock).
          Stakes: <strong>{stakesLevel}</strong>
          {!isGoldenPathStack(stack) && " · off golden path"}
        </p>
      </div>
    </>
  );
}

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
  buildIntakeHaystack,
  computeStakesLevel,
  findNearDuplicateRequests,
  hardGateReason,
  hasReuseMatches,
  isGoldenPathStack,
  matchFunnelReuse,
  recommendApproach,
  stackNeedsHardGate,
} from "@/lib/funnel";
import { DECISION_RULES } from "@/lib/mockDecisionRules";
import {
  getDemandUpvoteCount,
  isHighDemand,
} from "@/lib/requests";
import type {
  ChosenApproach,
  ChosenStack,
  FunnelStage,
  RequestPrerequisites,
  RequestValidation,
  RiskAnswer,
  Team,
  ToolType,
} from "@/lib/types";
import { TEAMS, formatToolType } from "@/lib/types";

const EMPTY_PREREQ: RequestPrerequisites = {
  dataSources: "",
  systems: "",
  inputsOutputs: "",
  touchesPII: "no",
  touchesPayments: "no",
  usesLLM: "no",
  needsExternalDep: "no",
};

const INTAKE_PROGRESS = [
  { id: "describe", label: "Describe the need", step: 1 },
  { id: "prerequisites", label: "What it touches", step: 2 },
  { id: "reuse-check", label: "Reuse check", step: 3 },
] as const;

const BUILDER_PROGRESS = [
  { id: "stack", label: "Stack", step: 1 },
  { id: "approach", label: "Approach", step: 2 },
] as const;

const RISK_FIELDS: {
  key: keyof Pick<
    RequestPrerequisites,
    "touchesPII" | "touchesPayments" | "usesLLM" | "needsExternalDep"
  >;
  label: string;
}[] = [
  { key: "touchesPII", label: "Touches PII" },
  { key: "touchesPayments", label: "Touches payments" },
  { key: "usesLLM", label: "Uses LLM" },
  { key: "needsExternalDep", label: "New external dependency" },
];

type FunnelUiStage =
  | FunnelStage
  | "reuse-check"
  | "posted"
  | "parked"
  | "awaiting-signoff";

function RiskToggleGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RiskAnswer;
  onChange: (value: RiskAnswer) => void;
}) {
  return (
    <fieldset className="funnel-risk-group">
      <legend className="t-label-rg">{label}</legend>
      <div className="funnel-risk-group__options">
        {(
          [
            ["no", "No"],
            ["yes", "Yes"],
            ["unsure", "Not sure"],
          ] as const
        ).map(([answer, text]) => (
          <label key={answer} className="funnel-risk-option t-para-sm">
            <input
              type="radio"
              name={label}
              checked={value === answer}
              onChange={() => onChange(answer)}
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DecisionFunnel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const requestIdParam = searchParams.get("requestId") ?? "";

  const {
    approvedTools,
    buildingBlocks,
    requests,
    mockUsers,
    currentUser,
    canSubmitTool,
    getRequestById,
    postOpenNeed,
    parkNeed,
    completeBuilderFunnel,
    upvoteRequest,
  } = useApp();

  const entryRequest = requestIdParam
    ? getRequestById(requestIdParam)
    : undefined;
  const isEnteringFromClaim = Boolean(
    entryRequest?.status === "claimed" &&
      entryRequest.claimedById === currentUser.id &&
      !entryRequest.linkedToolId,
  );

  const [createdRequestId, setCreatedRequestId] = useState("");
  const [title, setTitle] = useState(() => {
    if (entryRequest?.title) return entryRequest.title;
    return initialQuery.trim();
  });
  const [team, setTeam] = useState<Team>(
    () => entryRequest?.team ?? currentUser.team,
  );
  const [validation, setValidation] = useState<RequestValidation>(() => ({
    problem:
      entryRequest?.validation?.problem ?? entryRequest?.problem ?? "",
    whoHasIt: entryRequest?.validation?.whoHasIt ?? "",
    frequency: entryRequest?.validation?.frequency ?? "",
    currentWorkaround: entryRequest?.validation?.currentWorkaround ?? "",
    expectedValue: entryRequest?.validation?.expectedValue ?? "",
  }));
  const [prerequisites, setPrerequisites] = useState<RequestPrerequisites>(
    () => entryRequest?.prerequisites ?? { ...EMPTY_PREREQ },
  );
  const [stage, setStage] = useState<FunnelUiStage>(() =>
    isEnteringFromClaim ? "stack" : "describe",
  );
  const [reuseMatches, setReuseMatches] = useState<ReturnType<
    typeof matchFunnelReuse
  > | null>(null);
  const [stakesLevel, setStakesLevel] = useState(
    () =>
      entryRequest?.stakesLevel ??
      (entryRequest?.prerequisites
        ? computeStakesLevel(entryRequest.prerequisites, entryRequest.problem)
        : "low"),
  );
  const [stack, setStack] = useState<ChosenStack>({ ...GOLDEN_PATH_STACK });
  const [stackJustification, setStackJustification] = useState("");
  const [approach, setApproach] = useState<ChosenApproach | null>(null);
  const [approachJustification, setApproachJustification] = useState("");
  const [parkReason, setParkReason] = useState("");
  const [reuseOverrideNote, setReuseOverrideNote] = useState("");
  const [finishedToolId, setFinishedToolId] = useState("");

  const activeRequestId = requestIdParam || createdRequestId;
  const activeRequest = activeRequestId
    ? getRequestById(activeRequestId)
    : undefined;
  const isBuilderContinuation =
    stage === "stack" ||
    stage === "approach" ||
    stage === "awaiting-signoff";

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

  const nearDuplicates = useMemo(
    () => findNearDuplicateRequests(validation, title, requests),
    [validation, title, requests],
  );

  const similarOpenNeeds = useMemo(() => {
    const haystack = `${title} ${validation.problem}`.toLowerCase();
    return requests
      .filter((r) => r.status === "open" && r.id !== activeRequestId)
      .filter((r) => {
        const h = `${r.title} ${r.problem}`.toLowerCase();
        return haystack.split(/\s+/).some((w) => w.length > 3 && h.includes(w));
      })
      .slice(0, 3);
  }, [requests, title, validation.problem, activeRequestId]);

  const reuseHasMatches = reuseMatches ? hasReuseMatches(reuseMatches) : false;

  const intakeComplete = stage === "posted" || stage === "parked";
  const intakeCurrentStep = (() => {
    if (intakeComplete) return INTAKE_PROGRESS.length + 1;
    switch (stage) {
      case "describe":
        return 1;
      case "prerequisites":
        return 2;
      case "reuse-check":
        return 3;
      default:
        return 1;
    }
  })();

  const builderComplete = stage === "awaiting-signoff";
  const builderCurrentStep = (() => {
    if (builderComplete) return BUILDER_PROGRESS.length + 1;
    if (stage === "approach") return 2;
    return 1;
  })();

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

  function handleDescribeContinue() {
    setStage("prerequisites");
  }

  function handlePrerequisitesContinue() {
    const haystack = buildIntakeHaystack(title, validation, prerequisites);
    const level = computeStakesLevel(prerequisites, haystack);
    setStakesLevel(level);
    setReuseMatches(
      matchFunnelReuse(haystack, approvedTools, buildingBlocks),
    );
    setStage("reuse-check");
  }

  function handlePostOpenNeed() {
    if (reuseHasMatches && !reuseOverrideNote.trim()) return;

    const id = postOpenNeed({
      title,
      team,
      tags: title.toLowerCase().split(/\s+/).slice(0, 4),
      sourceQuery: initialQuery || undefined,
      prerequisites,
      validation,
      stakesLevel,
      reuseOverrideNote: reuseHasMatches ? reuseOverrideNote.trim() : undefined,
      autoClaimForBuilder: canSubmitTool,
    });

    if (canSubmitTool) {
      setCreatedRequestId(id);
      setApproach(recommendedApproach);
      setStage("stack");
      router.replace(`/funnel?requestId=${id}`, { scroll: false });
      return;
    }

    setCreatedRequestId(id);
    setStage("posted");
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
    const targetRequestId = activeRequestId;
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

    const { toolId, awaitingSignoff } = completeBuilderFunnel(
      targetRequestId,
      finalStack,
      finalApproach,
    );

    if (!toolId) return;

    setFinishedToolId(toolId);
    if (awaitingSignoff) {
      setStage("awaiting-signoff");
      return;
    }
    router.push(`/tools/${toolId}`);
  }

  return (
    <>
      <RoleBanner />

      <div className="funnel">
        <header className="funnel__header">
          <div>
            <h1 className="funnel__title t-display-xs">
              {isBuilderContinuation
                ? "Build from claimed need"
                : "Figure out what you need"}
            </h1>
            <p className="funnel__desc t-para-md">
              {isBuilderContinuation
                ? "You claimed this need. Two steps — stack, then approach — to write a planned tool to the registry."
                : "Describe the need → what it touches → reuse check → post an open need for builders to claim."}
            </p>
          </div>
          <Link href="/" className="funnel__close t-cta-sm text-link">
            <Icon name="cross" size={16} />
            Exit
          </Link>
        </header>

        {!isBuilderContinuation && (
          <div className="funnel-flow">
            <ol className="funnel-progress" aria-label="Intake progress">
              {INTAKE_PROGRESS.map((item) => {
                const done =
                  intakeComplete || item.step < intakeCurrentStep;
                const active =
                  !intakeComplete && item.step === intakeCurrentStep;
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
          </div>
        )}

        {isBuilderContinuation && (
          <div className="funnel-flow funnel-flow--build">
            <p className="funnel-flow__eyebrow t-label-sm">Build</p>
            <ol className="funnel-progress" aria-label="Build progress">
              {BUILDER_PROGRESS.map((item) => {
                const done =
                  builderComplete || item.step < builderCurrentStep;
                const active =
                  !builderComplete && item.step === builderCurrentStep;
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
          </div>
        )}

        {stage === "describe" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">Describe the need</h2>
            <p className="funnel-stage__intro t-para-rg">
              In your own words — what hurts, who feels it, and how often. No
              tool specs yet.
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
              <span className="form-field__label t-label-rg">The problem</span>
              <textarea
                className="form-field__input form-field__textarea t-para-rg"
                rows={3}
                value={validation.problem}
                onChange={(e) => updateValidation("problem", e.target.value)}
                placeholder="What is painful or slow today?"
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
              <span className="form-field__label t-label-rg">
                Current workaround{" "}
                <span className="text-muted">(optional)</span>
              </span>
              <input
                className="form-field__input t-para-rg"
                value={validation.currentWorkaround}
                onChange={(e) =>
                  updateValidation("currentWorkaround", e.target.value)
                }
                placeholder="Spreadsheets, manual steps, Slack hacks…"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label t-label-rg">
                Expected value{" "}
                <span className="text-muted">(optional)</span>
              </span>
              <input
                className="form-field__input t-para-rg"
                value={validation.expectedValue}
                onChange={(e) =>
                  updateValidation("expectedValue", e.target.value)
                }
                placeholder="Time saved, fewer errors, faster launches…"
              />
            </label>

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

            {similarOpenNeeds.length > 0 && (
              <div className="funnel-demand">
                <p className="funnel-demand__title t-subheading-rg">
                  Similar open needs — upvote instead of duplicating
                </p>
                <ul className="funnel-demand__list">
                  {similarOpenNeeds.map((req) => (
                    <li key={req.id} className="funnel-demand__item t-para-rg">
                      <strong>{req.title}</strong> —{" "}
                      {getDemandUpvoteCount(req, mockUsers)} upvote
                      {getDemandUpvoteCount(req, mockUsers) === 1 ? "" : "s"}
                      {isHighDemand(req, mockUsers) && (
                        <span className="funnel-demand__high t-tag-sm">
                          High demand
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handleDescribeContinue}
                disabled={
                  !title.trim() ||
                  !validation.problem.trim() ||
                  !validation.whoHasIt.trim() ||
                  !validation.frequency.trim()
                }
              >
                Continue
              </Button>
            </div>
          </section>
        )}

        {stage === "prerequisites" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">What does it touch?</h2>
            <p className="funnel-stage__intro t-para-rg">
              Quick scan for reuse and risk — we&apos;ll match tools and internal
              building blocks next.
            </p>

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

            <div className="funnel-risk-toggles">
              {RISK_FIELDS.map(({ key, label }) => (
                <RiskToggleGroup
                  key={key}
                  label={label}
                  value={prerequisites[key]}
                  onChange={(value) => updatePrereq(key, value)}
                />
              ))}
            </div>

            <div className="funnel-stage__actions">
              <Button
                variant="primary"
                onClick={handlePrerequisitesContinue}
              >
                Check for reuse
              </Button>
              <Button variant="secondary" onClick={() => setStage("describe")}>
                Back
              </Button>
            </div>
          </section>
        )}

        {stage === "reuse-check" && reuseMatches && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">Reuse check</h2>
            <p className="funnel-stage__intro t-para-rg">
              {reuseHasMatches
                ? "We found existing tools or building blocks — try these before posting a new need."
                : "No close matches in the catalog — you can post an open need for builders to claim."}
            </p>

            {reuseHasMatches && (
              <div className="funnel-reuse-hero">
                {reuseMatches.tools.length > 0 && (
                  <div className="funnel-reuse-block funnel-reuse-block--hero">
                    <p className="funnel-reuse-block__heading t-subheading-rg">
                      Matching tools
                    </p>
                    <div className="tool-grid tool-grid--compact">
                      {reuseMatches.tools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                    <ButtonLink
                      href={`/tools/${reuseMatches.tools[0].id}`}
                      variant="primary"
                      size="sm"
                    >
                      Open this tool
                    </ButtonLink>
                  </div>
                )}

                {reuseMatches.blocks.length > 0 && (
                  <div className="funnel-reuse-block funnel-reuse-block--hero">
                    <p className="funnel-reuse-block__heading t-subheading-rg">
                      Matching building blocks
                    </p>
                    <div className="building-block-grid">
                      {reuseMatches.blocks.map((block) => (
                        <BuildingBlockCard key={block.id} block={block} compact />
                      ))}
                    </div>
                    <ButtonLink
                      href="/registry?tab=blocks"
                      variant="primary"
                      size="sm"
                    >
                      See building blocks
                    </ButtonLink>
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
              </div>
            )}

            {nearDuplicates.length > 0 && (
              <div className="funnel-reuse-block funnel-reuse-block--secondary">
                <p className="funnel-reuse-block__heading t-subheading-rg">
                  Similar need already on the board
                </p>
                <ul className="funnel-demand__list">
                  {nearDuplicates.map((req) => (
                    <li key={req.id} className="funnel-demand__item">
                      <p className="t-para-rg">
                        <strong>{req.title}</strong> —{" "}
                        {getDemandUpvoteCount(req, mockUsers)} upvotes
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
                <p className="t-para-sm text-muted">
                  Optional — you can still post a novel need.
                </p>
              </div>
            )}

            {reuseHasMatches ? (
              <details className="funnel-disclosure">
                <summary className="funnel-disclosure__summary t-label-rg">
                  Not a fit? Post anyway or park
                </summary>
                <div className="funnel-disclosure__body">
                  <label className="form-field">
                    <span className="form-field__label t-label-rg">
                      None of these fit because…
                    </span>
                    <textarea
                      className="form-field__input form-field__textarea t-para-rg"
                      rows={2}
                      value={reuseOverrideNote}
                      onChange={(e) => setReuseOverrideNote(e.target.value)}
                      placeholder="Required to post past matches — logged for admins"
                    />
                  </label>

                  <div className="funnel-park funnel-park--inline">
                    <label className="form-field">
                      <span className="form-field__label t-label-rg">
                        Park reason
                      </span>
                      <textarea
                        className="form-field__input form-field__textarea t-para-rg"
                        rows={2}
                        value={parkReason}
                        onChange={(e) => setParkReason(e.target.value)}
                        placeholder="Why not pursue — stays searchable in the registry"
                      />
                    </label>
                    <Button variant="secondary" size="sm" onClick={handlePark}>
                      Park this need
                    </Button>
                  </div>

                  <div className="funnel-stage__actions">
                    <Button
                      variant="secondary"
                      onClick={handlePostOpenNeed}
                      disabled={!reuseOverrideNote.trim()}
                    >
                      Post open need anyway
                    </Button>
                  </div>
                </div>
              </details>
            ) : (
              <div className="funnel-stage__actions">
                <Button variant="primary" onClick={handlePostOpenNeed}>
                  Post open need
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setStage("prerequisites")}
                >
                  Back
                </Button>
              </div>
            )}

            {reuseHasMatches && (
              <div className="funnel-stage__actions funnel-stage__actions--muted">
                <Button
                  variant="secondary"
                  onClick={() => setStage("prerequisites")}
                >
                  Back
                </Button>
              </div>
            )}
          </section>
        )}

        {stage === "posted" && (
          <section className="funnel-stage funnel-stage--done">
            <div className="confirmation-card">
              <div className="confirmation-card__icon">
                <Icon name="checkmark" size={32} />
              </div>
              <h2 className="confirmation-card__title t-heading-md">
                Open need posted
              </h2>
              <p className="confirmation-card__desc t-para-md">
                <strong>{title}</strong> is on the requests board. Upvotes rank
                it; a builder claiming it is what makes it real.
              </p>
              {stakesLevel === "high" && (
                <p className="funnel-gate-note t-para-sm">
                  High stakes — builders will need admin sign-off before a
                  planned tool goes live.
                </p>
              )}
              <div className="confirmation-card__actions">
                <ButtonLink href="/requests" variant="primary">
                  View requests board
                </ButtonLink>
                <ButtonLink
                  href={`/requests#${createdRequestId}`}
                  variant="secondary"
                >
                  View this need
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
                Captured with your reason — searchable in the registry under
                needs.
              </p>
              <ButtonLink href="/registry?tab=needs" variant="primary">
                Search needs in registry
              </ButtonLink>
            </div>
          </section>
        )}

        {stage === "stack" && (
          <section className="funnel-stage">
            <h2 className="funnel-stage__title t-heading-md">Tech stack</h2>
            <p className="funnel-stage__intro t-para-rg">
              Golden path pre-selected. Low stakes — edit freely. High stakes or
              off-path — justify; admin sign-off required before go-live.
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
            <h2 className="funnel-stage__title t-heading-md">Approach</h2>

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
                  High-stakes override on recommended approach — admin sign-off
                  required.
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

        {stage === "awaiting-signoff" && (
          <section className="funnel-stage funnel-stage--done">
            <div className="confirmation-card confirmation-card--blocked">
              <div className="confirmation-card__icon">
                <Icon name="shield-tick" size={32} />
              </div>
              <h2 className="confirmation-card__title t-heading-md">
                Awaiting admin sign-off
              </h2>
              <p className="confirmation-card__desc t-para-md">
                <strong>{title}</strong> is a planned tool in the approval
                queue. It will not appear in search until an admin approves it.
              </p>
              <p className="funnel-gate-note t-para-sm">
                {hardGateReason(stakesLevel, stack, prerequisites)}
              </p>
              <div className="confirmation-card__actions">
                <ButtonLink href="/admin/approvals" variant="primary">
                  View approval queue
                </ButtonLink>
                {finishedToolId && (
                  <ButtonLink
                    href={`/tools/${finishedToolId}`}
                    variant="secondary"
                  >
                    View pending tool
                  </ButtonLink>
                )}
              </div>
            </div>
          </section>
        )}

        <p className="funnel-footnote t-para-sm text-muted">
          Decision rules loaded: {DECISION_RULES.length} seeded policies.
          Stakes: <strong>{stakesLevel}</strong>
          {!isGoldenPathStack(stack) && " · off golden path"}
        </p>
      </div>
    </>
  );
}

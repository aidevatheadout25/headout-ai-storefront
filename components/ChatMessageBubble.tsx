"use client";

import { BuildingBlockCard } from "@/components/BuildingBlockCard";
import { Button, ButtonLink } from "@/components/Button";
import { ToolCard } from "@/components/ToolCard";
import type { ChatMessage } from "@/lib/chatTypes";
import type { RequestPrerequisites } from "@/lib/types";
import { formatBuildPath } from "@/lib/types";

const RISK_FIELDS: {
  key: keyof Pick<
    RequestPrerequisites,
    "touchesPII" | "touchesPayments" | "usesLLM" | "needsExternalDep"
  >;
  label: string;
}[] = [
  { key: "touchesPII", label: "Personal data" },
  { key: "touchesPayments", label: "Payments" },
  { key: "usesLLM", label: "LLM / AI" },
  { key: "needsExternalDep", label: "New external dependency" },
];

function buildRegisterHref(
  name: string,
  oneLiner: string,
  toolType: string,
): string {
  const params = new URLSearchParams({
    name,
    oneLiner,
    type: toolType,
    status: "planned",
  });
  return `/submit?${params}`;
}

type ChatMessageBubbleProps = {
  message: ChatMessage;
  phase?: "q-risk";
  prerequisites?: RequestPrerequisites;
  interactive?: boolean;
  onQuickReply?: (replyId: string) => void;
};

export function ChatMessageBubble({
  message,
  phase,
  prerequisites,
  interactive = true,
  onQuickReply,
}: ChatMessageBubbleProps) {
  const showRiskPicker =
    message.attachment?.type === "risk-picker" &&
    phase === "q-risk" &&
    prerequisites;

  return (
    <li
      className={`home-chat__message home-chat__message--${message.role}`}
    >
      <div className="home-chat__bubble">
        <p className="home-chat__text t-para-rg">{message.text}</p>

        {message.attachment?.type === "matches" && (
          <div className="home-chat__matches">
            {message.attachment.tools.length > 0 && (
              <div className="tool-grid tool-grid--compact">
                {message.attachment.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            )}
            {message.attachment.blocks.length > 0 && (
              <div className="building-block-grid">
                {message.attachment.blocks.map((block) => (
                  <BuildingBlockCard key={block.id} block={block} compact />
                ))}
              </div>
            )}
          </div>
        )}

        {message.attachment?.type === "pm-recommendation" && (
          <div className="pm-recommendation home-chat__pm">
            <p className="pm-recommendation__headline t-heading-rg">
              {message.attachment.recommendation.buildPath.headline}
            </p>
            <p className="t-para-sm text-muted">
              {formatBuildPath(message.attachment.recommendation.buildPath.path)}
            </p>
            <ul className="pm-recommendation__reasoning">
              {message.attachment.recommendation.reasoning.map((line) => (
                <li key={line} className="t-para-sm">
                  {line}
                </li>
              ))}
            </ul>
            <div className="home-chat__plan">
              <p className="t-label-rg">Scoped plan</p>
              <p className="t-para-md">
                {message.attachment.recommendation.scopedPlan}
              </p>
            </div>
            <div className="pm-recommendation__steps">
              <p className="t-label-rg">First steps</p>
              <ol className="pm-recommendation__step-list">
                {message.attachment.recommendation.buildPath.firstSteps.map(
                  (step) => (
                    <li key={step} className="t-para-sm">
                      {step}
                    </li>
                  ),
                )}
              </ol>
            </div>
            {message.attachment.recommendation.nearMatchNote && (
              <p className="pm-recommendation__note t-para-sm">
                {message.attachment.recommendation.nearMatchNote}
              </p>
            )}
            {message.attachment.recommendation.stakesNote && (
              <p className="pm-recommendation__stakes t-para-sm">
                {message.attachment.recommendation.stakesNote}
              </p>
            )}
          </div>
        )}

        {message.attachment?.type === "register-cta" && (
          <div className="home-chat__register">
            <ButtonLink
              href={buildRegisterHref(
                message.attachment.name,
                message.attachment.oneLiner,
                message.attachment.toolType,
              )}
              variant="primary"
              size="sm"
            >
              Register in catalogue
            </ButtonLink>
            <p className="t-para-sm text-muted">
              Pending admin approval before it appears in search.
            </p>
          </div>
        )}

        {message.attachment?.type === "quick-replies" && (
          <div className="home-chat__replies">
            {message.attachment.replies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                className={`home-chat__reply home-chat__reply--${reply.variant ?? "secondary"} t-cta-sm`}
                onClick={() => interactive && onQuickReply?.(reply.id)}
                disabled={!interactive}
              >
                {reply.label}
              </button>
            ))}
          </div>
        )}

        {showRiskPicker && (
          <div className="home-chat__risk">
            {RISK_FIELDS.map(({ key, label }) => (
              <div key={key} className="home-chat__risk-row">
                <span className="t-label-rg">{label}</span>
                <div className="home-chat__risk-options">
                  {(
                    [
                      ["no", "No"],
                      ["yes", "Yes"],
                      ["unsure", "Not sure"],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`home-chat__reply home-chat__reply--${prerequisites[key] === val ? "primary" : "secondary"} t-cta-sm`}
                      onClick={() =>
                        interactive && onQuickReply?.(`risk:${key}:${val}`)
                      }
                      disabled={!interactive}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button
              variant="primary"
              size="sm"
              onClick={() => interactive && onQuickReply?.("risk-done")}
              disabled={!interactive}
            >
              Continue
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

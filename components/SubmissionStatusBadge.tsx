import type { Tool } from "@/lib/types";

function formatSubmissionStatus(tool: Tool): string {
  switch (tool.approvalStatus) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Live";
    case "rejected":
      return "Rejected";
    default: {
      const _exhaustive: never = tool.approvalStatus;
      return _exhaustive;
    }
  }
}

const STATUS_CLASS: Record<Tool["approvalStatus"], string> = {
  pending: "submission-status--pending",
  approved: "submission-status--live",
  rejected: "submission-status--rejected",
};

type SubmissionStatusBadgeProps = {
  tool: Tool;
};

export function SubmissionStatusBadge({ tool }: SubmissionStatusBadgeProps) {
  return (
    <span
      className={`submission-status t-tag-sm ${STATUS_CLASS[tool.approvalStatus]}`}
    >
      {formatSubmissionStatus(tool)}
    </span>
  );
}

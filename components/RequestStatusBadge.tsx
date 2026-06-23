import type { NeedRequest } from "@/lib/types";
import { formatRequestStatus } from "@/lib/requests";

const STATUS_CLASS: Record<NeedRequest["status"], string> = {
  open: "request-status--open",
  claimed: "request-status--claimed",
  fulfilled: "request-status--fulfilled",
};

type RequestStatusBadgeProps = {
  status: NeedRequest["status"];
};

export function RequestStatusBadge({ status }: RequestStatusBadgeProps) {
  return (
    <span className={`request-status t-tag-sm ${STATUS_CLASS[status]}`}>
      {formatRequestStatus(status)}
    </span>
  );
}

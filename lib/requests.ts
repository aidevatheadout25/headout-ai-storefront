import type { NeedRequest, RequestBoardSort } from "@/lib/types";

export function formatRequestStatus(status: NeedRequest["status"]): string {
  switch (status) {
    case "open":
      return "Open";
    case "claimed":
      return "Claimed";
    case "fulfilled":
      return "Fulfilled";
    case "parked":
      return "Parked";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function sortRequests(
  requests: NeedRequest[],
  sort: RequestBoardSort,
): NeedRequest[] {
  return [...requests].sort((a, b) => {
    if (sort === "demand") {
      const voteDiff = b.upvotes - a.upvotes;
      if (voteDiff !== 0) return voteDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function requestUpvotedByMe(
  request: NeedRequest,
  userId: string,
): boolean {
  return request.upvotedBy.includes(userId);
}

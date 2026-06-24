import type { MockUser, NeedRequest, RequestBoardSort, Team } from "@/lib/types";

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

export function getUserTeam(userId: string, users: MockUser[]): Team | undefined {
  return users.find((u) => u.id === userId)?.team;
}

/** Upvotes excluding the original requester — used for demand ranking */
export function getDemandUpvoteCount(
  request: NeedRequest,
  users: MockUser[],
): number {
  return request.upvotedBy.filter((id) => id !== request.requestedById).length;
}

export function getUpvoteTeams(
  request: NeedRequest,
  users: MockUser[],
): Team[] {
  const teams = new Set<Team>();
  for (const id of request.upvotedBy) {
    if (id === request.requestedById) continue;
    const team = getUserTeam(id, users);
    if (team) teams.add(team);
  }
  return [...teams];
}

export function isHighDemand(
  request: NeedRequest,
  users: MockUser[],
): boolean {
  return getUpvoteTeams(request, users).length >= 2;
}

export function sortRequests(
  requests: NeedRequest[],
  sort: RequestBoardSort,
  users: MockUser[],
): NeedRequest[] {
  return [...requests].sort((a, b) => {
    if (sort === "demand") {
      const voteDiff =
        getDemandUpvoteCount(b, users) - getDemandUpvoteCount(a, users);
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

export function canUpvoteRequest(
  request: NeedRequest,
  userId: string,
): boolean {
  return request.requestedById !== userId && !request.upvotedBy.includes(userId);
}

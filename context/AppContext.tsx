"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEMO_USER,
  INITIAL_APPROVED_TOOLS,
  INITIAL_PENDING_TOOLS,
} from "@/lib/mockData";
import { INITIAL_FLAGGED_TOOLS } from "@/lib/flaggedTools";
import { INITIAL_REQUESTS, MOCK_USERS } from "@/lib/mockRequests";
import { isIdeaSubmission, isOwnerMatch } from "@/lib/toolMeta";
import type {
  BuilderAccessRequest,
  MockUser,
  NeedRequest,
  Owner,
  RequestFormData,
  Role,
  Tool,
  ToolFlag,
  ToolFlagReasonCategory,
  ToolFormData,
} from "@/lib/types";

type AppContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  approvedTools: Tool[];
  pendingTools: Tool[];
  rejectedTools: Tool[];
  allTools: Tool[];
  requests: NeedRequest[];
  mySubmissions: Tool[];
  myRequests: NeedRequest[];
  hasTrackingItems: boolean;
  flaggedTools: ToolFlag[];
  zeroResultSearchCount: number;
  mockUsers: MockUser[];
  builderAccessRequests: BuilderAccessRequest[];
  submitTool: (data: ToolFormData) => string;
  updateTool: (id: string, data: ToolFormData) => void;
  updatePendingTool: (id: string, data: ToolFormData) => void;
  resubmitRejectedTool: (id: string, data: ToolFormData) => void;
  approveTool: (id: string) => void;
  rejectTool: (id: string, reason: string) => void;
  markHelpful: (id: string) => void;
  recordClick: (id: string) => void;
  requestAccess: (id: string) => void;
  accessRequests: string[];
  flagTool: (toolId: string, reasonCategory: ToolFlagReasonCategory, note?: string) => void;
  dismissFlag: (flagId: string) => void;
  archiveFromFlag: (flagId: string) => void;
  deprecateFromFlag: (flagId: string) => void;
  confirmOwnership: (toolId: string) => void;
  transferOwnership: (toolId: string, owner: Owner) => void;
  archiveTool: (toolId: string) => void;
  deprecateTool: (toolId: string) => void;
  restoreToLive: (toolId: string) => void;
  recordZeroResultSearch: (query: string) => void;
  fileRequest: (data: RequestFormData) => string;
  upvoteRequest: (id: string) => void;
  claimRequest: (id: string) => string | null;
  requestBuilderAccess: () => void;
  grantBuilderRole: (userId: string) => void;
  revokeBuilderRole: (userId: string) => void;
  approveBuilderAccessRequest: (id: string) => void;
  dismissBuilderAccessRequest: (id: string) => void;
  canFileRequest: boolean;
  canSubmitTool: boolean;
  canClaimRequest: boolean;
  canManageBuilders: boolean;
  canApprove: boolean;
  canEditTool: (tool: Tool) => boolean;
  canManageTool: (tool: Tool) => boolean;
  canViewTool: (tool: Tool) => boolean;
  currentUser: typeof DEMO_USER;
  getToolById: (id: string) => Tool | undefined;
  getRequestById: (id: string) => NeedRequest | undefined;
  hasPendingBuilderAccessRequest: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function formToTool(
  data: ToolFormData,
  id: string,
  approvalStatus: Tool["approvalStatus"],
  preserve?: Partial<Tool>,
): Tool {
  const ownerConfirmed = isOwnerMatch(data.ownerSlackId, DEMO_USER.slackId);

  return {
    id,
    name: data.name,
    oneLiner: data.oneLiner,
    description: data.description || data.oneLiner,
    types: data.types.length > 0 ? data.types : ["app"],
    link: data.link,
    owner: { name: data.ownerName, slackId: data.ownerSlackId },
    team: data.team,
    tags: data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    accessLevel: data.accessLevel,
    sensitive: data.sensitive,
    writeCapable: data.writeCapable,
    ownerInstructions: data.ownerInstructions,
    accessContact:
      data.accessLevel !== "open"
        ? `${data.ownerSlackId} on Slack`
        : undefined,
    githubUrl: data.githubUrl || undefined,
    status: data.status,
    approvalStatus,
    submittedBy: preserve?.submittedBy ?? DEMO_USER.id,
    usageStats: preserve?.usageStats ?? { views: 0, clicks: 0, helpful: 0 },
    lastUpdated: preserve?.lastUpdated ?? nowIso(),
    lastUsed: preserve?.lastUsed ?? nowIso(),
    linkUnreachable: preserve?.linkUnreachable,
    ownerConfirmed: preserve?.ownerConfirmed ?? ownerConfirmed,
    rejectReason: preserve?.rejectReason,
  };
}

function toolToForm(tool: Tool): ToolFormData {
  return {
    name: tool.name,
    oneLiner: tool.oneLiner,
    types: tool.types,
    link: tool.link,
    ownerName: tool.owner.name,
    ownerSlackId: tool.owner.slackId,
    team: tool.team,
    tags: tool.tags.join(", "),
    accessLevel: tool.accessLevel,
    sensitive: tool.sensitive,
    writeCapable: tool.writeCapable,
    githubUrl: tool.githubUrl ?? "",
    description: tool.description,
    ownerInstructions: tool.ownerInstructions,
    status: tool.status,
  };
}

export { toolToForm };

function patchApproved(
  tools: Tool[],
  id: string,
  patch: Partial<Tool>,
): Tool[] {
  return tools.map((t) => (t.id === id ? { ...t, ...patch, lastUpdated: nowIso() } : t));
}

function fulfillLinkedRequests(
  requests: NeedRequest[],
  toolId: string,
  toolStatus: Tool["status"],
  approvalStatus: Tool["approvalStatus"],
): NeedRequest[] {
  if (approvalStatus !== "approved" || toolStatus !== "live") {
    return requests;
  }
  return requests.map((r) =>
    r.linkedToolId === toolId && r.status === "claimed"
      ? { ...r, status: "fulfilled" as const }
      : r,
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("viewer");
  const [approvedTools, setApprovedTools] = useState<Tool[]>(
    INITIAL_APPROVED_TOOLS,
  );
  const [pendingTools, setPendingTools] = useState<Tool[]>(
    INITIAL_PENDING_TOOLS,
  );
  const [rejectedTools, setRejectedTools] = useState<Tool[]>([]);
  const [requests, setRequests] = useState<NeedRequest[]>(INITIAL_REQUESTS);
  const [flaggedTools, setFlaggedTools] = useState<ToolFlag[]>(
    INITIAL_FLAGGED_TOOLS,
  );
  const [accessRequests, setAccessRequests] = useState<string[]>([]);
  const [zeroResultSearchCount, setZeroResultSearchCount] = useState(0);
  const [mockUsers, setMockUsers] = useState<MockUser[]>(MOCK_USERS);
  const [builderAccessRequests, setBuilderAccessRequests] = useState<
    BuilderAccessRequest[]
  >([]);

  const allTools = useMemo(
    () => [...approvedTools, ...pendingTools, ...rejectedTools],
    [approvedTools, pendingTools, rejectedTools],
  );

  const mySubmissions = useMemo(
    () =>
      allTools
        .filter((t) => t.submittedBy === DEMO_USER.id)
        .sort(
          (a, b) =>
            new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
        ),
    [allTools],
  );

  const myRequests = useMemo(
    () =>
      requests
        .filter((r) => r.requestedById === DEMO_USER.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [requests],
  );

  const hasTrackingItems = mySubmissions.length > 0 || myRequests.length > 0;

  const canFileRequest = true;
  const canSubmitTool = role === "builder" || role === "admin";
  const canClaimRequest = role === "builder" || role === "admin";
  const canManageBuilders = role === "admin";
  const canApprove = role === "admin";

  const hasPendingBuilderAccessRequest = builderAccessRequests.some(
    (r) => r.userId === DEMO_USER.id,
  );

  const canViewTool = useCallback(
    (tool: Tool) => {
      if (tool.approvalStatus === "approved") return true;
      if (role === "admin") {
        return tool.approvalStatus === "pending" || tool.approvalStatus === "rejected";
      }
      if (tool.submittedBy === DEMO_USER.id) {
        return tool.approvalStatus === "pending" || tool.approvalStatus === "rejected";
      }
      return false;
    },
    [role],
  );

  const canEditTool = useCallback(
    (tool: Tool) => {
      if (role === "admin") return true;
      if (tool.submittedBy !== DEMO_USER.id) return false;
      return (
        tool.approvalStatus === "approved" ||
        tool.approvalStatus === "rejected" ||
        tool.approvalStatus === "pending"
      );
    },
    [role],
  );

  const canManageTool = useCallback(
    (tool: Tool) => {
      if (tool.approvalStatus !== "approved") return false;
      if (role === "admin") return true;
      return isOwnerMatch(tool.owner.slackId, DEMO_USER.slackId);
    },
    [role],
  );

  const getToolById = useCallback(
    (id: string) => allTools.find((t) => t.id === id),
    [allTools],
  );

  const getRequestById = useCallback(
    (id: string) => requests.find((r) => r.id === id),
    [requests],
  );

  const submitTool = useCallback((data: ToolFormData): string => {
    const id = slugify(data.name) || `tool-${Date.now()}`;
    const tool = formToTool(data, id, "pending");
    setPendingTools((prev) => [tool, ...prev]);
    return id;
  }, []);

  const updateTool = useCallback((id: string, data: ToolFormData) => {
    setApprovedTools((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== id) return t;
        const ownerConfirmed = isOwnerMatch(data.ownerSlackId, DEMO_USER.slackId)
          ? t.ownerConfirmed
          : isOwnerMatch(data.ownerSlackId, t.owner.slackId)
            ? t.ownerConfirmed
            : false;
        return formToTool(data, id, "approved", {
          ...t,
          ownerConfirmed,
        });
      });
      const tool = updated.find((t) => t.id === id);
      if (tool) {
        setRequests((reqs) =>
          fulfillLinkedRequests(reqs, id, tool.status, tool.approvalStatus),
        );
      }
      return updated;
    });
  }, []);

  const updatePendingTool = useCallback((id: string, data: ToolFormData) => {
    setPendingTools((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const ownerConfirmed = isOwnerMatch(data.ownerSlackId, DEMO_USER.slackId)
          ? t.ownerConfirmed
          : isOwnerMatch(data.ownerSlackId, t.owner.slackId)
            ? t.ownerConfirmed
            : false;
        return formToTool(data, id, "pending", {
          ...t,
          ownerConfirmed,
        });
      }),
    );
  }, []);

  const resubmitRejectedTool = useCallback((id: string, data: ToolFormData) => {
    setRejectedTools((prev) => {
      const tool = prev.find((t) => t.id === id);
      if (!tool) return prev;

      const resubmitted = formToTool(data, id, "pending", {
        ...tool,
        rejectReason: undefined,
      });
      setPendingTools((pending) => [resubmitted, ...pending]);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const approveTool = useCallback((id: string) => {
    setPendingTools((prev) => {
      const tool = prev.find((t) => t.id === id);
      if (!tool) return prev;

      const published: Tool = {
        ...tool,
        approvalStatus: "approved",
        rejectReason: undefined,
        lastUpdated: nowIso(),
        status: isIdeaSubmission(tool)
          ? "planned"
          : tool.status === "beta"
            ? "live"
            : tool.status === "planned"
              ? "live"
              : tool.status,
      };

      setApprovedTools((approved) => [published, ...approved]);
      setRequests((reqs) =>
        fulfillLinkedRequests(
          reqs,
          id,
          published.status,
          published.approvalStatus,
        ),
      );
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const rejectTool = useCallback((id: string, reason: string) => {
    setPendingTools((prev) => {
      const tool = prev.find((t) => t.id === id);
      if (!tool) return prev;

      const rejected: Tool = {
        ...tool,
        approvalStatus: "rejected",
        rejectReason: reason.trim(),
        lastUpdated: nowIso(),
      };
      setRejectedTools((rejectedList) => [rejected, ...rejectedList]);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const fileRequest = useCallback((data: RequestFormData): string => {
    const id = slugify(data.title) || `req-${Date.now()}`;
    const tags = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const request: NeedRequest = {
      id,
      title: data.title.trim(),
      problem: data.problem.trim(),
      requestedBy: { name: DEMO_USER.name, slackId: DEMO_USER.slackId },
      requestedById: DEMO_USER.id,
      team: data.team,
      tags,
      upvotes: 1,
      upvotedBy: [DEMO_USER.id],
      status: "open",
      createdAt: nowIso(),
    };
    setRequests((prev) => [request, ...prev]);
    return id;
  }, []);

  const upvoteRequest = useCallback((id: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.upvotedBy.includes(DEMO_USER.id)) return r;
        return {
          ...r,
          upvotes: r.upvotes + 1,
          upvotedBy: [...r.upvotedBy, DEMO_USER.id],
        };
      }),
    );
  }, []);

  const claimRequest = useCallback((id: string): string | null => {
    let createdToolId: string | null = null;

    setRequests((prev) => {
      const request = prev.find((r) => r.id === id);
      if (!request || request.status !== "open") return prev;
      if (role !== "builder" && role !== "admin") return prev;

      const toolId = slugify(request.title) || `tool-${Date.now()}`;
      createdToolId = toolId;

      const toolData: ToolFormData = {
        name: request.title,
        oneLiner: request.problem,
        types: ["app"],
        link: "",
        ownerName: DEMO_USER.name,
        ownerSlackId: DEMO_USER.slackId,
        team: request.team,
        tags: request.tags.join(", "),
        accessLevel: "open",
        sensitive: false,
        writeCapable: false,
        githubUrl: "",
        description: request.problem,
        ownerInstructions: `Claimed from request. Reach out to ${request.requestedBy.slackId} on Slack.`,
        status: "planned",
      };

      const tool = formToTool(toolData, toolId, "pending", {
        submittedBy: DEMO_USER.id,
        ownerConfirmed: true,
      });

      setPendingTools((pending) => [tool, ...pending]);

      return prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "claimed" as const,
              claimedBy: { name: DEMO_USER.name, slackId: DEMO_USER.slackId },
              claimedById: DEMO_USER.id,
              linkedToolId: toolId,
            }
          : r,
      );
    });

    return createdToolId;
  }, [role]);

  const requestBuilderAccess = useCallback(() => {
    if (role !== "viewer") return;
    if (builderAccessRequests.some((r) => r.userId === DEMO_USER.id)) return;
    const entry: BuilderAccessRequest = {
      id: `bar-${Date.now()}`,
      userId: DEMO_USER.id,
      userName: DEMO_USER.name,
      userSlackId: DEMO_USER.slackId,
      team: DEMO_USER.team,
      createdAt: nowIso(),
    };
    setBuilderAccessRequests((prev) => [entry, ...prev]);
  }, [role, builderAccessRequests]);

  const grantBuilderRole = useCallback((userId: string) => {
    setMockUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: "builder" } : u)),
    );
    if (userId === DEMO_USER.id) {
      setRole("builder");
    }
  }, []);

  const revokeBuilderRole = useCallback((userId: string) => {
    setMockUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: "viewer" } : u)),
    );
    if (userId === DEMO_USER.id) {
      setRole("viewer");
    }
  }, []);

  const approveBuilderAccessRequest = useCallback(
    (id: string) => {
      const entry = builderAccessRequests.find((r) => r.id === id);
      if (!entry) return;
      grantBuilderRole(entry.userId);
      setBuilderAccessRequests((prev) => prev.filter((r) => r.id !== id));
    },
    [builderAccessRequests, grantBuilderRole],
  );

  const dismissBuilderAccessRequest = useCallback((id: string) => {
    setBuilderAccessRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const markHelpful = useCallback((id: string) => {
    setApprovedTools((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              usageStats: {
                ...t.usageStats,
                helpful: t.usageStats.helpful + 1,
              },
            }
          : t,
      ),
    );
  }, []);

  const recordClick = useCallback((id: string) => {
    const clickedAt = nowIso();
    setApprovedTools((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              lastUsed: clickedAt,
              usageStats: {
                ...t.usageStats,
                clicks: t.usageStats.clicks + 1,
                views: t.usageStats.views + 1,
              },
            }
          : t,
      ),
    );
  }, []);

  const requestAccess = useCallback((id: string) => {
    setAccessRequests((prev) =>
      prev.includes(id) ? prev : [...prev, id],
    );
  }, []);

  const flagTool = useCallback(
    (toolId: string, reasonCategory: ToolFlagReasonCategory, note?: string) => {
      const tool = approvedTools.find((t) => t.id === toolId);
      if (!tool) return;

      const flag: ToolFlag = {
        id: `flag-${Date.now()}`,
        toolId,
        toolName: tool.name,
        reasonCategory,
        note: note?.trim() || undefined,
        reporterName: DEMO_USER.name,
        reporterSlackId: DEMO_USER.slackId,
        createdAt: nowIso(),
      };
      setFlaggedTools((prev) => [flag, ...prev]);
    },
    [approvedTools],
  );

  const dismissFlag = useCallback((flagId: string) => {
    setFlaggedTools((prev) => prev.filter((f) => f.id !== flagId));
  }, []);

  const archiveFromFlag = useCallback((flagId: string) => {
    setFlaggedTools((prev) => {
      const flag = prev.find((f) => f.id === flagId);
      if (flag) {
        setApprovedTools((tools) =>
          patchApproved(tools, flag.toolId, { status: "archived" }),
        );
      }
      return prev.filter((f) => f.id !== flagId);
    });
  }, []);

  const deprecateFromFlag = useCallback((flagId: string) => {
    setFlaggedTools((prev) => {
      const flag = prev.find((f) => f.id === flagId);
      if (flag) {
        setApprovedTools((tools) =>
          patchApproved(tools, flag.toolId, { status: "deprecated" }),
        );
      }
      return prev.filter((f) => f.id !== flagId);
    });
  }, []);

  const confirmOwnership = useCallback((toolId: string) => {
    setApprovedTools((prev) =>
      patchApproved(prev, toolId, { ownerConfirmed: true }),
    );
    setPendingTools((prev) =>
      prev.map((t) =>
        t.id === toolId ? { ...t, ownerConfirmed: true, lastUpdated: nowIso() } : t,
      ),
    );
  }, []);

  const transferOwnership = useCallback((toolId: string, owner: Owner) => {
    setApprovedTools((prev) =>
      patchApproved(prev, toolId, {
        owner,
        ownerConfirmed: isOwnerMatch(owner.slackId, DEMO_USER.slackId),
      }),
    );
  }, []);

  const archiveTool = useCallback((toolId: string) => {
    setApprovedTools((prev) =>
      patchApproved(prev, toolId, { status: "archived" }),
    );
  }, []);

  const deprecateTool = useCallback((toolId: string) => {
    setApprovedTools((prev) =>
      patchApproved(prev, toolId, { status: "deprecated" }),
    );
  }, []);

  const restoreToLive = useCallback((toolId: string) => {
    setApprovedTools((prev) => {
      const updated = patchApproved(prev, toolId, { status: "live" });
      const tool = updated.find((t) => t.id === toolId);
      if (tool) {
        setRequests((reqs) =>
          fulfillLinkedRequests(reqs, toolId, tool.status, tool.approvalStatus),
        );
      }
      return updated;
    });
  }, []);

  const recordZeroResultSearch = useCallback((_query: string) => {
    setZeroResultSearchCount((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      role,
      setRole,
      approvedTools,
      pendingTools,
      rejectedTools,
      allTools,
      requests,
      mySubmissions,
      myRequests,
      hasTrackingItems,
      flaggedTools,
      zeroResultSearchCount,
      mockUsers,
      builderAccessRequests,
      submitTool,
      updateTool,
      updatePendingTool,
      resubmitRejectedTool,
      approveTool,
      rejectTool,
      markHelpful,
      recordClick,
      requestAccess,
      accessRequests,
      flagTool,
      dismissFlag,
      archiveFromFlag,
      deprecateFromFlag,
      confirmOwnership,
      transferOwnership,
      archiveTool,
      deprecateTool,
      restoreToLive,
      recordZeroResultSearch,
      fileRequest,
      upvoteRequest,
      claimRequest,
      requestBuilderAccess,
      grantBuilderRole,
      revokeBuilderRole,
      approveBuilderAccessRequest,
      dismissBuilderAccessRequest,
      canFileRequest,
      canSubmitTool,
      canClaimRequest,
      canManageBuilders,
      canApprove,
      canEditTool,
      canManageTool,
      canViewTool,
      currentUser: DEMO_USER,
      getToolById,
      getRequestById,
      hasPendingBuilderAccessRequest,
    }),
    [
      role,
      approvedTools,
      pendingTools,
      rejectedTools,
      allTools,
      requests,
      mySubmissions,
      myRequests,
      hasTrackingItems,
      flaggedTools,
      zeroResultSearchCount,
      mockUsers,
      builderAccessRequests,
      submitTool,
      updateTool,
      updatePendingTool,
      resubmitRejectedTool,
      approveTool,
      rejectTool,
      markHelpful,
      recordClick,
      requestAccess,
      accessRequests,
      flagTool,
      dismissFlag,
      archiveFromFlag,
      deprecateFromFlag,
      confirmOwnership,
      transferOwnership,
      archiveTool,
      deprecateTool,
      restoreToLive,
      recordZeroResultSearch,
      fileRequest,
      upvoteRequest,
      claimRequest,
      requestBuilderAccess,
      grantBuilderRole,
      revokeBuilderRole,
      approveBuilderAccessRequest,
      dismissBuilderAccessRequest,
      canSubmitTool,
      canClaimRequest,
      canApprove,
      canEditTool,
      canManageTool,
      canViewTool,
      getToolById,
      getRequestById,
      hasPendingBuilderAccessRequest,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}

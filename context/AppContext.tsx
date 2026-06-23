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
import { isIdeaSubmission, isOwnerMatch } from "@/lib/toolMeta";
import type { Owner, Role, Tool, ToolFlag, ToolFormData } from "@/lib/types";

type AppContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  approvedTools: Tool[];
  pendingTools: Tool[];
  rejectedTools: Tool[];
  allTools: Tool[];
  mySubmissions: Tool[];
  hasSubmissions: boolean;
  flaggedTools: ToolFlag[];
  zeroResultSearchCount: number;
  submitTool: (data: ToolFormData) => string;
  updateTool: (id: string, data: ToolFormData) => void;
  resubmitRejectedTool: (id: string, data: ToolFormData) => void;
  approveTool: (id: string) => void;
  rejectTool: (id: string, reason: string) => void;
  markHelpful: (id: string) => void;
  recordClick: (id: string) => void;
  requestAccess: (id: string) => void;
  accessRequests: string[];
  flagTool: (toolId: string, reason: string) => void;
  dismissFlag: (flagId: string) => void;
  archiveFromFlag: (flagId: string) => void;
  confirmOwnership: (toolId: string) => void;
  transferOwnership: (toolId: string, owner: Owner) => void;
  archiveTool: (toolId: string) => void;
  recordZeroResultSearch: (query: string) => void;
  canSubmit: boolean;
  canApprove: boolean;
  canEditTool: (tool: Tool) => boolean;
  canManageTool: (tool: Tool) => boolean;
  canViewTool: (tool: Tool) => boolean;
  currentUser: typeof DEMO_USER;
  getToolById: (id: string) => Tool | undefined;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("viewer");
  const [approvedTools, setApprovedTools] = useState<Tool[]>(
    INITIAL_APPROVED_TOOLS,
  );
  const [pendingTools, setPendingTools] = useState<Tool[]>(
    INITIAL_PENDING_TOOLS,
  );
  const [rejectedTools, setRejectedTools] = useState<Tool[]>([]);
  const [flaggedTools, setFlaggedTools] = useState<ToolFlag[]>(
    INITIAL_FLAGGED_TOOLS,
  );
  const [accessRequests, setAccessRequests] = useState<string[]>([]);
  const [zeroResultSearchCount, setZeroResultSearchCount] = useState(0);

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

  const hasSubmissions = mySubmissions.length > 0;

  const canSubmit = true;
  const canApprove = role === "admin";

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
      if (role === "builder" && tool.submittedBy === DEMO_USER.id) {
        return tool.approvalStatus === "approved" || tool.approvalStatus === "rejected";
      }
      return false;
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

  const submitTool = useCallback((data: ToolFormData): string => {
    const id = slugify(data.name) || `tool-${Date.now()}`;
    const tool = formToTool(data, id, "pending");
    setPendingTools((prev) => [tool, ...prev]);
    return id;
  }, []);

  const updateTool = useCallback((id: string, data: ToolFormData) => {
    setApprovedTools((prev) =>
      prev.map((t) => {
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

  const flagTool = useCallback((toolId: string, reason: string) => {
    const tool = approvedTools.find((t) => t.id === toolId);
    if (!tool) return;

    const flag: ToolFlag = {
      id: `flag-${Date.now()}`,
      toolId,
      toolName: tool.name,
      reason,
      reporterName: DEMO_USER.name,
      reporterSlackId: DEMO_USER.slackId,
      createdAt: nowIso(),
    };
    setFlaggedTools((prev) => [flag, ...prev]);
  }, [approvedTools]);

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
      mySubmissions,
      hasSubmissions,
      flaggedTools,
      zeroResultSearchCount,
      submitTool,
      updateTool,
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
      confirmOwnership,
      transferOwnership,
      archiveTool,
      recordZeroResultSearch,
      canSubmit,
      canApprove,
      canEditTool,
      canManageTool,
      canViewTool,
      currentUser: DEMO_USER,
      getToolById,
    }),
    [
      role,
      approvedTools,
      pendingTools,
      rejectedTools,
      allTools,
      mySubmissions,
      hasSubmissions,
      flaggedTools,
      zeroResultSearchCount,
      submitTool,
      updateTool,
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
      confirmOwnership,
      transferOwnership,
      archiveTool,
      recordZeroResultSearch,
      canApprove,
      canEditTool,
      canManageTool,
      canViewTool,
      getToolById,
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

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
import type { Role, Tool, ToolFormData } from "@/lib/types";

type AppContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  approvedTools: Tool[];
  pendingTools: Tool[];
  allTools: Tool[];
  submitTool: (data: ToolFormData) => string;
  updateTool: (id: string, data: ToolFormData) => void;
  approveTool: (id: string) => void;
  rejectTool: (id: string, reason: string) => void;
  markHelpful: (id: string) => void;
  recordClick: (id: string) => void;
  canSubmit: boolean;
  canApprove: boolean;
  canEditTool: (tool: Tool) => boolean;
  currentUserId: string;
  getToolById: (id: string) => Tool | undefined;
};

const AppContext = createContext<AppContextValue | null>(null);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formToTool(data: ToolFormData, id: string, status: Tool["status"]): Tool {
  return {
    id,
    name: data.name,
    oneLiner: data.oneLiner,
    description: data.description || data.oneLiner,
    type: data.type,
    link: data.link,
    owner: { name: data.ownerName, slackId: data.ownerSlackId },
    team: data.team,
    tags: data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    accessLevel: data.accessLevel,
    accessContact:
      data.accessLevel === "gated"
        ? `${data.ownerSlackId} on Slack`
        : undefined,
    githubUrl: data.githubUrl || undefined,
    status,
    submittedBy: DEMO_USER.id,
    usageStats: { views: 0, clicks: 0, helpful: 0 },
  };
}

function toolToForm(tool: Tool): ToolFormData {
  return {
    name: tool.name,
    oneLiner: tool.oneLiner,
    type: tool.type,
    link: tool.link,
    ownerName: tool.owner.name,
    ownerSlackId: tool.owner.slackId,
    team: tool.team,
    tags: tool.tags.join(", "),
    accessLevel: tool.accessLevel,
    githubUrl: tool.githubUrl ?? "",
    description: tool.description,
  };
}

export { toolToForm };

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("viewer");
  const [approvedTools, setApprovedTools] = useState<Tool[]>(
    INITIAL_APPROVED_TOOLS,
  );
  const [pendingTools, setPendingTools] = useState<Tool[]>(
    INITIAL_PENDING_TOOLS,
  );

  const allTools = useMemo(
    () => [...approvedTools, ...pendingTools],
    [approvedTools, pendingTools],
  );

  const canSubmit = role === "admin" || role === "builder";
  const canApprove = role === "admin";

  const canEditTool = useCallback(
    (tool: Tool) => {
      if (role === "admin") return true;
      if (role === "builder") return tool.submittedBy === DEMO_USER.id;
      return false;
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
    const updated = formToTool(data, id, "approved");
    setApprovedTools((prev) =>
      prev.map((t) => (t.id === id ? { ...updated, usageStats: t.usageStats, status: "approved" } : t)),
    );
  }, []);

  const approveTool = useCallback((id: string) => {
    setPendingTools((prev) => {
      const tool = prev.find((t) => t.id === id);
      if (!tool) return prev;
      setApprovedTools((approved) => [
        { ...tool, status: "approved" },
        ...approved,
      ]);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const rejectTool = useCallback((id: string, reason: string) => {
    setPendingTools((prev) => prev.filter((t) => t.id !== id));
    void reason;
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
    setApprovedTools((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
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

  const value = useMemo(
    () => ({
      role,
      setRole,
      approvedTools,
      pendingTools,
      allTools,
      submitTool,
      updateTool,
      approveTool,
      rejectTool,
      markHelpful,
      recordClick,
      canSubmit,
      canApprove,
      canEditTool,
      currentUserId: DEMO_USER.id,
      getToolById,
    }),
    [
      role,
      approvedTools,
      pendingTools,
      allTools,
      submitTool,
      updateTool,
      approveTool,
      rejectTool,
      markHelpful,
      recordClick,
      canSubmit,
      canApprove,
      canEditTool,
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

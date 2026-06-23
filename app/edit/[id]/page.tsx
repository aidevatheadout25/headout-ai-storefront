"use client";

import { useParams, notFound } from "next/navigation";
import { ToolForm } from "@/components/ToolForm";
import { EmptyState } from "@/components/EmptyState";
import { toolToForm, useApp } from "@/context/AppContext";

export default function EditToolPage() {
  const params = useParams();
  const id = params.id as string;
  const { getToolById, canEditTool } = useApp();
  const tool = getToolById(id);

  if (
    !tool ||
    (tool.approvalStatus !== "approved" && tool.approvalStatus !== "rejected")
  ) {
    notFound();
  }

  if (!canEditTool(tool)) {
    return (
      <EmptyState
        icon="shield-tick"
        title="You can't edit this tool"
        description="Switch to Builder (for your own tools) or Admin to edit registry entries."
      />
    );
  }

  const isResubmit = tool.approvalStatus === "rejected";

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">
            {isResubmit ? "Edit and resubmit" : "Edit tool"}
          </h1>
          <p className="page-header__desc t-para-md">
            {isResubmit
              ? `Update ${tool.name} and send it back to the review queue.`
              : `Update ${tool.name} — changes go live immediately.`}
          </p>
          {isResubmit && tool.rejectReason && (
            <p className="review-banner__desc t-para-sm">
              Previous feedback: {tool.rejectReason}
            </p>
          )}
        </div>
      </div>
      <ToolForm
        mode={isResubmit ? "resubmit" : "edit"}
        toolId={id}
        initialData={toolToForm(tool)}
      />
    </>
  );
}

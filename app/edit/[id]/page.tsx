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
    (tool.approvalStatus !== "approved" &&
      tool.approvalStatus !== "rejected" &&
      tool.approvalStatus !== "pending")
  ) {
    notFound();
  }

  if (!canEditTool(tool)) {
    return (
      <EmptyState
        icon="shield-tick"
        title="You can't edit this tool"
        description="Only the person who submitted this entry — or an admin — can edit it."
      />
    );
  }

  const isResubmit = tool.approvalStatus === "rejected";
  const isPendingEdit = tool.approvalStatus === "pending";

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">
            {isResubmit
              ? "Edit and resubmit"
              : isPendingEdit
                ? "Edit submission"
                : "Edit tool"}
          </h1>
          <p className="page-header__desc t-para-md">
            {isResubmit
              ? `Update ${tool.name} and send it back to the review queue.`
              : isPendingEdit
                ? `Update ${tool.name} while it's still in the admin queue.`
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
        mode={isResubmit ? "resubmit" : isPendingEdit ? "edit-pending" : "edit"}
        toolId={id}
        initialData={toolToForm(tool)}
      />
    </>
  );
}

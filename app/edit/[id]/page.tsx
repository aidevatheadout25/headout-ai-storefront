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

  if (!tool || tool.status !== "approved") {
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Edit tool</h1>
          <p className="page-header__desc t-para-md">
            Update {tool.name} — changes go live immediately.
          </p>
        </div>
      </div>
      <ToolForm mode="edit" toolId={id} initialData={toolToForm(tool)} />
    </>
  );
}

"use client";

import { ToolForm } from "@/components/ToolForm";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { DEMO_USER } from "@/lib/mockData";
import { useApp } from "@/context/AppContext";

export default function SubmitPage() {
  const { canSubmit } = useApp();

  if (!canSubmit) {
    return (
      <EmptyState
        icon="shield-tick"
        title="Submit access required"
        description="Switch to Builder or Admin role in the header to register a tool."
      />
    );
  }

  return (
    <>
      <RoleBanner />
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Submit a tool</h1>
          <p className="page-header__desc t-para-md">
            Register what you built — it goes live after admin approval.
          </p>
        </div>
      </div>
      <ToolForm
        mode="create"
        initialData={{
          name: "",
          oneLiner: "",
          type: "app",
          link: "",
          ownerName: DEMO_USER.name,
          ownerSlackId: DEMO_USER.slackId,
          team: DEMO_USER.team,
          tags: "",
          accessLevel: "open",
          githubUrl: "",
          description: "",
        }}
      />
    </>
  );
}

"use client";

import { Suspense } from "react";
import { ToolForm } from "@/components/ToolForm";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { ButtonLink } from "@/components/Button";
import { useApp } from "@/context/AppContext";

function SubmitPageContent() {
  const { canSubmitTool } = useApp();

  if (!canSubmitTool) {
    return (
      <>
        <RoleBanner />
        <EmptyState
          icon="shield-tick"
          title="Builder access required"
          description="Only builders and admins can register tools. File a need if something's missing, or request builder access from an admin."
          action={
            <div className="empty-state__action-row">
              <ButtonLink href="/file-need" variant="primary">
                File a need
              </ButtonLink>
              <ButtonLink href="/my-submissions" variant="secondary">
                Request builder access
              </ButtonLink>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <RoleBanner />
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Submit a tool</h1>
          <p className="page-header__desc t-para-md">
            Register what you built — make it findable for everyone at Headout.
            Builder access is granted by an admin.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="t-para-md">Loading form…</p>}>
        <ToolForm mode="create" />
      </Suspense>
    </>
  );
}

export default function SubmitPage() {
  return <SubmitPageContent />;
}

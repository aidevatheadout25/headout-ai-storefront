"use client";

import { Suspense } from "react";
import { ToolForm } from "@/components/ToolForm";
import { EmptyState } from "@/components/EmptyState";
import { RoleBanner } from "@/components/RoleSwitcher";
import { ButtonLink } from "@/components/Button";
import { useApp } from "@/context/AppContext";

function SubmitPageContent() {
  const { canSubmitTool, canRegisterNetNewTool } = useApp();

  if (!canSubmitTool) {
    return (
      <>
        <RoleBanner />
        <EmptyState
          icon="shield-tick"
          title="Builder access required"
          description="Only builders and admins can register tools. Use guided intake if something's missing, or request builder access from an admin."
          action={
            <div className="empty-state__action-row">
              <ButtonLink href="/funnel" variant="primary">
                Figure out a need
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

  if (!canRegisterNetNewTool) {
    return (
      <>
        <RoleBanner />
        <EmptyState
          icon="bulb"
          title="Start from a need"
          description="Net-new tools go through guided intake first — post or claim an open need so reuse and dedup run before you build. You can still edit tools you already own."
          action={
            <div className="empty-state__action-row">
              <ButtonLink href="/funnel" variant="primary">
                Start guided intake
              </ButtonLink>
              <ButtonLink href="/requests" variant="secondary">
                Browse open needs
              </ButtonLink>
              <ButtonLink href="/my-submissions" variant="secondary">
                My tools & needs
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
            Admin override — register a net-new tool without a claimed need.
            Builders should use guided intake instead.
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

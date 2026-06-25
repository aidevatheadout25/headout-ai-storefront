"use client";

import { Suspense } from "react";
import { ToolForm } from "@/components/ToolForm";
import { RoleBanner } from "@/components/RoleSwitcher";

function SubmitPageContent() {
  return (
    <>
      <RoleBanner />
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Register a tool</h1>
          <p className="page-header__desc t-para-md">
            Add what you built to the catalogue. New entries need admin approval
            before they appear in search.
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

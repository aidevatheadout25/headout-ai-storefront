"use client";

import { Suspense } from "react";
import { ToolForm } from "@/components/ToolForm";
import { RoleBanner } from "@/components/RoleSwitcher";

export default function SubmitPage() {
  return (
    <>
      <RoleBanner />
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">Submit a tool</h1>
          <p className="page-header__desc t-para-md">
            Register what you built — or log a planned idea so others don&apos;t
            duplicate it. Anyone can submit; your first submission makes you a
            builder.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="t-para-md">Loading form…</p>}>
        <ToolForm mode="create" />
      </Suspense>
    </>
  );
}

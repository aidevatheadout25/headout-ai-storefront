"use client";

import { Suspense } from "react";
import { RequestForm } from "@/components/RequestForm";
import { RoleBanner } from "@/components/RoleSwitcher";

export default function FileNeedPage() {
  return (
    <>
      <RoleBanner />
      <div className="page-header">
        <div>
          <h1 className="page-header__title t-display-xs">File a need</h1>
          <p className="page-header__desc t-para-md">
            Tell us what&apos;s missing — demand, not a tool spec. Anyone at
            Headout can file a request.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="t-para-md">Loading form…</p>}>
        <RequestForm />
      </Suspense>
    </>
  );
}

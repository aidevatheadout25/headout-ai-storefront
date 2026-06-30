import { Suspense } from "react";
import { RegisterToolChat } from "@/components/RegisterToolChat";
import { RoleBanner } from "@/components/RoleSwitcher";

export default function SubmitPage() {
  return (
    <div className="submit-page">
      <RoleBanner />
      <div className="page-header submit-page__header">
        <div>
          <h1 className="page-header__title t-display-xs">Register a tool</h1>
          <p className="page-header__desc t-para-md">
            Tell us what you built in the chat — the listing summary updates as you
            go. New entries need admin approval before they appear in search.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="t-para-md">Loading…</p>}>
        <RegisterToolChat />
      </Suspense>
    </div>
  );
}

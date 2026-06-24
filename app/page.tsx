"use client";

import { Suspense } from "react";
import { AskBar } from "@/components/AskBar";
import { FirstRunExplainer } from "@/components/FirstRunExplainer";
import { KitsSection } from "@/components/KitsSection";
import { McpUsePanel } from "@/components/McpUsePanel";
import { RecommendedSection } from "@/components/RecommendedSection";
import { RoleBanner } from "@/components/RoleSwitcher";
import { ButtonLink } from "@/components/Button";
import Link from "next/link";
import { useApp } from "@/context/AppContext";

export default function HomePage() {
  const { canSubmitTool } = useApp();

  return (
    <>
      <RoleBanner />
      <FirstRunExplainer />

      <section className="hero">
        <h1 className="hero__title t-display-md">
          Find what your team already built
        </h1>
        <p className="hero__subtitle t-para-lg">
          One place to discover every internal tool, skill, MCP, and bot at
          Headout — so you don&apos;t build it twice.
        </p>

        <Suspense fallback={<p className="t-para-md">Loading search…</p>}>
          <AskBar />
        </Suspense>

        <p className="hero__idea-entry t-para-rg">
          Something missing?{" "}
          <Link href="/funnel" className="hero__idea-link t-cta-sm">
            Start guided intake
          </Link>
          {" — "}
          describe the need, check reuse, post for builders to claim.
        </p>
      </section>

      <RecommendedSection />
      <KitsSection />
      <McpUsePanel />

      <section className="cta-strip">
        <div>
          <h2 className="cta-strip__title t-heading-md">
            {canSubmitTool ? "Ready to build?" : "See what others need"}
          </h2>
          <p className="cta-strip__desc t-para-rg">
            {canSubmitTool
              ? "Claim an open need or post a new one — stack and approach come after claim."
              : "Upvote open needs or use guided intake to describe a new one."}
          </p>
        </div>
        {canSubmitTool ? (
          <div className="cta-strip__actions">
            <ButtonLink href="/requests" variant="primary">
              Browse open needs
            </ButtonLink>
            <ButtonLink href="/funnel" variant="secondary">
              Post a need
            </ButtonLink>
          </div>
        ) : (
          <ButtonLink href="/funnel" variant="primary">
            Figure out a need
          </ButtonLink>
        )}
      </section>
    </>
  );
}

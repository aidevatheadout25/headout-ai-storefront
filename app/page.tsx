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
          <Link href="/file-need" className="hero__idea-link t-cta-sm">
            File a need
          </Link>
        </p>
      </section>

      <RecommendedSection />
      <KitsSection />
      <McpUsePanel />

      <section className="cta-strip">
        <div>
          <h2 className="cta-strip__title t-heading-md">
            {canSubmitTool ? "Built something useful?" : "See what others need"}
          </h2>
          <p className="cta-strip__desc t-para-rg">
            {canSubmitTool
              ? "Register it once — make it findable for everyone at Headout."
              : "Upvote open requests or file your own need on the requests board."}
          </p>
        </div>
        {canSubmitTool ? (
          <ButtonLink href="/submit" variant="primary">
            Submit a tool
          </ButtonLink>
        ) : (
          <ButtonLink href="/requests" variant="primary">
            View requests
          </ButtonLink>
        )}
      </section>
    </>
  );
}

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

export default function HomePage() {
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
          Have an idea?{" "}
          <Link href="/submit?status=planned" className="hero__idea-link t-cta-sm">
            Register it
          </Link>
        </p>
      </section>

      <RecommendedSection />
      <KitsSection />
      <McpUsePanel />

      <section className="cta-strip">
        <div>
          <h2 className="cta-strip__title t-heading-md">
            Built something useful?
          </h2>
          <p className="cta-strip__desc t-para-rg">
            Register it once — make it findable for everyone at Headout.
          </p>
        </div>
        <ButtonLink href="/submit" variant="primary">
          Submit a tool
        </ButtonLink>
      </section>
    </>
  );
}

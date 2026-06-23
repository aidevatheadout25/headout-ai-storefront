"use client";

import { AskBar } from "@/components/AskBar";
import { KitsSection } from "@/components/KitsSection";
import { RecommendedSection } from "@/components/RecommendedSection";
import { RoleBanner } from "@/components/RoleSwitcher";
import { ButtonLink } from "@/components/Button";
import { useApp } from "@/context/AppContext";

export default function HomePage() {
  const { canSubmit } = useApp();

  return (
    <>
      <RoleBanner />

      <section className="hero">
        <h1 className="hero__title t-display-md">
          Find what your team already built
        </h1>
        <p className="hero__subtitle t-para-lg">
          One place to discover every internal tool, skill, MCP, and bot at
          Headout — so you don&apos;t build it twice.
        </p>

        <AskBar />
      </section>

      <RecommendedSection />
      <KitsSection />

      {canSubmit && (
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
      )}
    </>
  );
}

"use client";

import { Suspense } from "react";
import { HomeChat } from "@/components/HomeChat";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="t-para-md">Loading…</p>}>
      <HomeChat />
    </Suspense>
  );
}

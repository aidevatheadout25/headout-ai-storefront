"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildFunnelUrl } from "@/lib/askBar";

/** @deprecated All needs flow through guided intake — redirects to funnel */
export function RequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const title = searchParams.get("title") ?? "";
    const problem = searchParams.get("problem") ?? "";
    const q = title || problem;
    router.replace(buildFunnelUrl(q));
  }, [router, searchParams]);

  return null;
}

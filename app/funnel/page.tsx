import { Suspense } from "react";
import { DecisionFunnel } from "@/components/DecisionFunnel";

export default function FunnelPage() {
  return (
    <Suspense fallback={<p className="t-para-md">Loading funnel…</p>}>
      <DecisionFunnel />
    </Suspense>
  );
}

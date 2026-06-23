import { Suspense } from "react";
import { RegistryView } from "@/components/RegistryView";

export default function RegistryPage() {
  return (
    <Suspense fallback={<p className="t-para-md">Loading registry...</p>}>
      <RegistryView />
    </Suspense>
  );
}

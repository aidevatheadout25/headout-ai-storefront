"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Same-path query changes need a refresh so registry views and sidebar state update. */
export function useRegistryNavigation() {
  const router = useRouter();

  return useCallback(
    (href: string) => {
      router.push(href);
      router.refresh();
    },
    [router],
  );
}

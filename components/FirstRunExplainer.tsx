"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

const STORAGE_KEY = "sf-first-run-dismissed";

export function FirstRunExplainer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="first-run-strip" role="status">
      <p className="first-run-strip__text t-para-rg">
        Find an internal tool before you build one. Search, or{" "}
        <Link href="/file-need" className="first-run-strip__cta t-cta-sm">
          file a need
        </Link>
        .
      </p>
      <button
        type="button"
        className="first-run-strip__dismiss"
        onClick={dismiss}
        aria-label="Dismiss explainer"
      >
        <Icon name="cross" size={16} />
      </button>
    </div>
  );
}

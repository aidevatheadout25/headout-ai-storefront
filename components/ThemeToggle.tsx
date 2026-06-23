"use client";

import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      <span className="theme-toggle__label t-label-sm">
        {isDark ? "Dark" : "Light"}
      </span>
      <span className="theme-toggle__track" aria-hidden="true">
        <span
          className={`theme-toggle__thumb${isDark ? " theme-toggle__thumb--dark" : ""}`}
        />
      </span>
    </button>
  );
}

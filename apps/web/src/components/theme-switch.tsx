"use client";

import { useLayoutEffect } from "react";

import { applyTheme, currentTheme, followSystemTheme, resolveTheme, setTheme, useTheme } from "@/lib/theme";

/**
 * Rocker wall switch: "I" pressed + lit window = light theme ("đèn bật"), "O" = dark.
 * Its look is driven by CSS on html[data-theme] (see .rocker in globals.css),
 * so it paints in the right position before hydration.
 */
export default function ThemeSwitch() {
  const theme = useTheme();
  const isLight = theme === "light";

  useLayoutEffect(() => {
    // In dev, Strict Mode's remount strips the attribute the <head> script set: re-apply it.
    applyTheme(resolveTheme());
    return followSystemTheme();
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === null ? undefined : isLight}
      aria-label="Giao diện sáng"
      title={isLight ? "Tắt đèn: chuyển sang giao diện tối" : "Bật đèn: chuyển sang giao diện sáng"}
      onClick={() => setTheme(currentTheme() === "light" ? "dark" : "light")}
      className="rocker"
    >
      <span className="rocker-paddle" aria-hidden>
        <span className="rocker-lamp" />
        <span className="rocker-off" />
      </span>
    </button>
  );
}

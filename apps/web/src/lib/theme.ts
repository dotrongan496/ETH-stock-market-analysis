// Light/dark theme: stored in localStorage, applied as <html data-theme="light|dark">.
// No stored choice → follow the OS setting. Without the attribute the CSS defaults to dark.

import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme-script";

export type Theme = "light" | "dark";

const THEME_COLOR: Record<Theme, string> = { dark: "#0b0e14", light: "#f3f5f8" };

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** The theme the page should show: the user's choice, else the OS setting. */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Theme currently applied to the document. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/** User picked a theme: apply and remember it. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / storage blocked: the choice lasts for this page only.
  }
}

/** Follow OS changes while the user has not picked a theme. Returns an unsubscribe. */
export function followSystemTheme(): () => void {
  const query = matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (storedTheme() === null) applyTheme(systemTheme());
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Applied theme, kept in sync with <html data-theme>. `null` during server render / hydration. */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, currentTheme, () => null);
}

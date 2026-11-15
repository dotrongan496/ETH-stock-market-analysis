// Shared lightweight-charts setup: theme chrome and Vietnamese date labels.

import { ColorType, TickMarkType, type ChartOptions, type DeepPartial, type Time } from "lightweight-charts";

import type { Interval } from "@/lib/api";
import { formatDay, formatMonth } from "@/lib/format";
import type { Theme } from "@/lib/theme";

/** Chart chrome per theme, matching the CSS tokens in globals.css. */
const CHROME: Record<
  Theme,
  { background: string; text: string; grid: string; border: string; crosshair: string; label: string }
> = {
  dark: {
    background: "#0b0e14",
    text: "#8b95a7",
    grid: "rgba(148, 163, 184, 0.07)",
    border: "#1e2431",
    crosshair: "#64748b",
    label: "#1f2735",
  },
  light: {
    background: "#e8ebef",
    text: "#586272",
    grid: "rgba(15, 23, 42, 0.07)",
    border: "#d6dbe2",
    crosshair: "#8a94a6",
    label: "#334155",
  },
};

export function chromeOptions(theme: Theme): DeepPartial<ChartOptions> {
  const c = CHROME[theme];
  const line = { color: c.crosshair, labelBackgroundColor: c.label };
  return {
    layout: { background: { type: ColorType.Solid, color: c.background }, textColor: c.text },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
    crosshair: { vertLine: line, horzLine: line },
  };
}

/** Muted color of the theme, for reference lines. */
export function chromeMuted(theme: Theme): string {
  return CHROME[theme].crosshair;
}

/** lightweight-charts may hand back a string, a BusinessDay or a UTC timestamp. */
export function timeToIso(time: Time): string {
  if (typeof time === "string") return time;
  if (typeof time === "number") return new Date(time * 1000).toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

export function formatTimeLabel(time: Time, interval: Interval): string {
  const iso = timeToIso(time);
  return interval === "1m" ? formatMonth(iso) : formatDay(iso);
}

export function tickMarkFormatter(time: Time, type: TickMarkType): string | null {
  const [year, month, day] = timeToIso(time).split("-");
  switch (type) {
    case TickMarkType.Year:
      return year;
    case TickMarkType.Month:
      return `T${Number(month)}`;
    case TickMarkType.DayOfMonth:
      return `${day}/${month}`;
    default:
      return null;
  }
}

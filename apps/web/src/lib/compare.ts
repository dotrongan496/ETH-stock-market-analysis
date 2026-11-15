// Comparison chart: several instruments rebased to 0% at the start of the visible window.

import type { Interval, PriceBar } from "@/lib/api";
import { rangeFilter, type ChartRange } from "@/lib/range";

/** Instruments that can be added next to the main one (5 lines in total). */
export const MAX_COMPARE = 4;

export interface CompareSlot {
  symbol: string;
  /** Color slot 1..MAX_COMPARE (0 is the main instrument); kept when others are removed. */
  slot: number;
}

export interface ComparePoint {
  time: string;
  /** % change of the close vs the first close of the window. */
  value: number;
}

/** CSS color of a slot (see --series-N in globals.css), for the current theme. */
export function seriesColor(slot: number): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(`--series-${slot}`).trim() ||
    "#60a5fa"
  );
}

export function nextFreeSlot(used: ReadonlyArray<CompareSlot>): number | null {
  for (let slot = 1; slot <= MAX_COMPARE; slot++) {
    if (!used.some((item) => item.slot === slot)) return slot;
  }
  return null;
}

/**
 * Rebase every series to its first close inside one shared window, so the lines start
 * together at 0%. The window ends at the latest bar of any series (crypto trades at the
 * weekend, stocks do not) and never starts before the youngest series has data, which
 * matters for "Tất cả".
 */
export function rebase(
  list: ReadonlyArray<ReadonlyArray<PriceBar>>,
  interval: Interval,
  range: ChartRange,
): ComparePoint[][] {
  const filled = list.filter((bars) => bars.length > 0);
  if (filled.length === 0) return list.map(() => []);
  const end = filled.map((bars) => bars[bars.length - 1].time).reduce((a, b) => (a > b ? a : b));
  const start = filled.map((bars) => bars[0].time).reduce((a, b) => (a > b ? a : b));
  const inRange = rangeFilter(end, interval, range);

  return list.map((bars) => {
    const window = bars.filter((bar) => bar.time >= start && inRange(bar.time));
    const base = window[0]?.close;
    if (!base) return [];
    return window.map((bar) => ({ time: bar.time, value: (bar.close / base - 1) * 100 }));
  });
}

/** Last point at or before `time` (the line's value under the crosshair), else the last one. */
export function valueAt(points: ReadonlyArray<ComparePoint>, time: string | null): ComparePoint | null {
  if (points.length === 0) return null;
  if (time === null) return points[points.length - 1];
  let lo = 0;
  let hi = points.length - 1;
  if (points[0].time > time) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return points[lo];
}

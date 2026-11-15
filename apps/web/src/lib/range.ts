// Visible time window of the chart: the last N days / months / years, or everything.

import type { Interval, PriceBar } from "@/lib/api";
import { shiftMonths } from "@/lib/format";

export type RangeUnit = "day" | "month" | "year";
export type RangeCount = number | "all";

export interface ChartRange {
  unit: RangeUnit;
  /** "all" is only offered for years. */
  count: RangeCount;
}

export const DEFAULT_RANGE: ChartRange = { unit: "month", count: 6 };

/** Fixed wheel lengths; years go up to the data actually available. */
export const UNIT_MAX: Record<Exclude<RangeUnit, "year">, number> = { day: 30, month: 12 };

const UNIT_LABEL: Record<RangeUnit, string> = { day: "ngày", month: "tháng", year: "năm" };

export function describeRange(range: ChartRange): string {
  return range.count === "all" ? "Toàn bộ dữ liệu" : `${range.count} ${UNIT_LABEL[range.unit]} gần nhất`;
}

/** Shift an ISO date by whole days. */
export function shiftDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole years the bars span (at least 1): the length of the "Năm" wheel. */
export function yearsSpanned(bars: PriceBar[]): number {
  if (bars.length === 0) return 1;
  const [y0, m0] = bars[0].time.split("-").map(Number);
  const [y1, m1] = bars[bars.length - 1].time.split("-").map(Number);
  const months = (y1 - y0) * 12 + (m1 - m0) + 1;
  return Math.max(1, Math.ceil(months / 12));
}

/**
 * Index of the first bar inside `range`, the window ending at the latest bar.
 * Daily candles: bars after the same date N units back (calendar time, so "7 ngày" is
 * about 5 trading sessions for stocks). Monthly candles: the last N months.
 */
export function rangeStartIndex(bars: PriceBar[], interval: Interval, range: ChartRange): number {
  if (bars.length === 0 || range.count === "all") return 0;
  const last = bars[bars.length - 1].time;
  const months = range.unit === "year" ? range.count * 12 : range.count;

  let inRange: (time: string) => boolean;
  if (interval === "1m") {
    // Monthly bars are dated on the 1st; a day window keeps just the latest month.
    const from = range.unit === "day" ? last : shiftMonths(last, -(months - 1));
    inRange = (time) => time >= from;
  } else {
    const from = range.unit === "day" ? shiftDays(last, -range.count) : shiftMonths(last, -months);
    inRange = (time) => time > from;
  }
  const index = bars.findIndex((bar) => inRange(bar.time));
  return index === -1 ? bars.length - 1 : index;
}

/** Keep the count meaningful when the unit changes (e.g. "Tất cả" → 30 ngày). */
export function switchUnit(range: ChartRange, unit: RangeUnit, maxYears: number): ChartRange {
  if (unit === "year") {
    const count = range.count === "all" || range.count > maxYears ? "all" : range.count;
    return { unit, count };
  }
  const max = UNIT_MAX[unit];
  return { unit, count: range.count === "all" ? max : Math.min(range.count, max) };
}

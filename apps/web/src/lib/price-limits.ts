// Vietnamese stock price limits: reference (tham chiếu), ceiling (trần), floor (sàn).
//
// Reference = previous session's close (UPCoM really uses the previous session's average
// price, which the daily data does not have, so the close is used there too). Ceiling and
// floor are the reference ± the exchange's daily band, rounded inwards to the tick size.

import type { Instrument } from "@/lib/api";

/** How the "Cổ phiếu VN" tab is shown: "Giá trị" (candles, compare) or "Thị trường" (board colors). */
export type StockView = "value" | "market";

/** Board colors: purple at ceiling, light blue at floor, yellow at reference, else green / red. */
export type PriceState = "ceil" | "floor" | "ref" | "up" | "down";

export interface PriceLimits {
  reference: number;
  ceiling: number;
  floor: number;
}

const DAILY_BAND: Record<string, number> = { HOSE: 0.07, HNX: 0.1, UPCOM: 0.15 };

/** Daily band in %, e.g. 7 for HOSE; null for venues without one (crypto). */
export function bandPct(exchange: string): number | null {
  const band = DAILY_BAND[exchange];
  return band === undefined ? null : Math.round(band * 100);
}

/** Price step: HOSE 10 / 50 / 100 ₫ by price level, HNX and UPCoM 100 ₫. */
export function tickSize(price: number, exchange: string): number {
  if (exchange !== "HOSE") return 100;
  if (price < 10_000) return 10;
  if (price < 50_000) return 50;
  return 100;
}

export function priceLimits(reference: number, exchange: string): PriceLimits | null {
  const band = DAILY_BAND[exchange];
  if (band === undefined || !(reference > 0)) return null;
  const rawCeiling = reference * (1 + band);
  const rawFloor = reference * (1 - band);
  const ceilingTick = tickSize(rawCeiling, exchange);
  const floorTick = tickSize(rawFloor, exchange);
  // The epsilon keeps exact multiples (e.g. 21.400) from being pushed a tick away by float error.
  let ceiling = Math.floor(rawCeiling / ceilingTick + 1e-9) * ceilingTick;
  let floor = Math.ceil(rawFloor / floorTick - 1e-9) * floorTick;
  // Very low prices: the band is smaller than one tick, so the limits are one tick away.
  if (ceiling <= reference) ceiling = reference + ceilingTick;
  if (floor >= reference) floor = Math.max(floorTick, reference - floorTick);
  return { reference, ceiling, floor };
}

/**
 * Board state of a price. Small tolerance: older bars are dividend-adjusted, so a session that
 * closed at the ceiling may land a fraction of a tick off the limit recomputed from them.
 */
export function priceState(price: number, limits: PriceLimits): PriceState {
  const tolerance = 0.0005;
  if (price >= limits.ceiling * (1 - tolerance)) return "ceil";
  if (price <= limits.floor * (1 + tolerance)) return "floor";
  if (Math.abs(price - limits.reference) <= limits.reference * tolerance) return "ref";
  return price > limits.reference ? "up" : "down";
}

/** Limits of the latest session for a VN stock in the watchlist; null for crypto / no data. */
export function instrumentLimits(instrument: Instrument): PriceLimits | null {
  if (instrument.asset_class !== "stock" || instrument.quote_currency !== "VND") return null;
  let reference = instrument.prev_close ?? null;
  // Older API without prev_close: derive it from the latest close and % change.
  if (reference == null && instrument.last_close != null && instrument.change_pct != null) {
    const raw = instrument.last_close / (1 + instrument.change_pct / 100);
    const tick = tickSize(raw, instrument.exchange);
    reference = Math.round(raw / tick) * tick;
  }
  return reference == null ? null : priceLimits(reference, instrument.exchange);
}

/** Tailwind classes per state (tokens in globals.css). */
export const STATE_TEXT: Record<PriceState, string> = {
  ceil: "text-ceil",
  floor: "text-floor",
  ref: "text-flat",
  up: "text-up",
  down: "text-down",
};

export const STATE_BADGE: Record<PriceState, string> = {
  ceil: "bg-ceil/15 text-ceil",
  floor: "bg-floor/15 text-floor",
  ref: "bg-flat/15 text-flat",
  up: "bg-up/15 text-up",
  down: "bg-down/15 text-down",
};

export const STATE_LABEL: Record<PriceState, string> = {
  ceil: "Giá trần",
  floor: "Giá sàn",
  ref: "Bằng tham chiếu",
  up: "Tăng",
  down: "Giảm",
};

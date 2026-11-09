// Vietnamese (vi-VN) formatting helpers: "85.900 ₫", "2.450.000.000 ₫", "+1,23%".

const LOCALE = "vi-VN";

export const DEFAULT_USD_VND_RATE = 25_400;
/** Matches the API's upper bound for `usd_vnd_rate`. */
export const MAX_USD_VND_RATE = 1_000_000;

// One formatter per number of decimals (0..8), created once.
const byDecimals = Array.from(
  { length: 9 },
  (_, digits) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }),
);

const percent = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatNumber(value: number, decimals: number): string {
  return byDecimals[Math.min(8, Math.max(0, Math.round(decimals)))].format(value);
}

/** Decimals that keep a VND amount readable: none from 1.000 ₫ up, more for tiny prices. */
export function vndDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1000) return 0;
  if (abs >= 1) return 2;
  return Math.min(8, 3 - Math.floor(Math.log10(abs))); // ~4 significant digits
}

/** Decimals for a price in its own quote currency (e.g. USDT). */
export function quoteDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  return 6;
}

/** VND amount without the currency sign (price axis). */
export function formatPrice(value: number): string {
  return formatNumber(value, vndDecimals(value));
}

/** VND amount with the ₫ sign, e.g. "85.900 ₫". */
export function formatVnd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatPrice(value)} ₫`;
}

/** Signed percentage, e.g. "+1,23%" / "-0,45%" / "0,00%". */
export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${percent.format(value)}%`;
}

/** Direction of a % change after rounding to what is displayed (2 decimals). */
export function changeDirection(value: number | null | undefined): "up" | "down" | "flat" | null {
  if (value == null || !Number.isFinite(value)) return null;
  const shown = Math.round(value * 100) / 100;
  return shown > 0 ? "up" : shown < 0 ? "down" : "flat";
}

/** Traded quantity: shares for stocks, coins for crypto. */
export function formatVolume(value: number): string {
  const abs = Math.abs(value);
  return formatNumber(value, abs >= 1000 ? 0 : abs >= 1 ? 2 : 4);
}

/** "2026-11-09" -> "09/11/2026" */
export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** "2026-11-01" -> "11/2026" */
export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${month}/${year}`;
}

/** Shift an ISO date by whole months, clamping the day (e.g. 31/03 - 1 month = 28 or 29/02). */
export function shiftMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  const daysInMonth = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${newYear}-${pad(newMonth)}-${pad(Math.min(day, daysInMonth))}`;
}

/** Parse the rate input ("25.400", "25400"): a positive integer up to the API limit, else null. */
export function parseRate(input: string): number | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return value > 0 && value <= MAX_USD_VND_RATE ? value : null;
}

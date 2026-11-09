// Typed client for the FastAPI backend (services/api).

export type AssetClass = "stock" | "crypto";
export type Interval = "1d" | "1m";

export interface Instrument {
  symbol: string;
  exchange: string;
  asset_class: AssetClass;
  name: string | null;
  quote_currency: string;
  last_trade_date: string | null;
  /** Latest close in the instrument's own quote currency (VND or USDT). */
  last_close: number | null;
  last_close_vnd: number | null;
  /** % change of the latest close vs the previous session. */
  change_pct: number | null;
}

export interface PriceBar {
  /** "YYYY-MM-DD": session date (1d) or first day of the month (1m). */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceSeries {
  symbol: string;
  exchange: string;
  asset_class: AssetClass;
  name: string | null;
  quote_currency: string;
  currency: "VND";
  interval: Interval;
  usd_vnd_rate: number | null;
  bars: PriceBar[];
}

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE_URL}${path}?${new URLSearchParams(params)}`;
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(`Không kết nối được API tại ${API_BASE_URL}.`);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(`API trả về lỗi ${response.status}: ${detail}`, response.status);
  }
  return (await response.json()) as T;
}

export function fetchInstruments(usdVndRate: number, signal?: AbortSignal): Promise<Instrument[]> {
  return getJson("/api/instruments", { usd_vnd_rate: String(usdVndRate) }, signal);
}

export function fetchPrices(
  symbol: string,
  interval: Interval,
  usdVndRate: number,
  signal?: AbortSignal,
): Promise<PriceSeries> {
  return getJson(
    `/api/prices/${encodeURIComponent(symbol)}`,
    { interval, usd_vnd_rate: String(usdVndRate) },
    signal,
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Đã xảy ra lỗi không xác định.";
}

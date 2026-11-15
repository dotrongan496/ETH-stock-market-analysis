// Watchlist preferences (kept in this browser): starred instruments and list order.

import type { Instrument } from "@/lib/api";
import { baseSymbol, displayName } from "@/lib/instrument";
import { storedValue } from "@/lib/stored";

export type SortKey = "default" | "gainers" | "losers" | "turnover";

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "default", label: "Mã A → Z" },
  { value: "gainers", label: "Tăng mạnh" },
  { value: "losers", label: "Giảm mạnh" },
  { value: "turnover", label: "GTGD cao" },
];

const EMPTY: readonly string[] = [];

export const favorites = storedValue<readonly string[]>("watchlist.favorites", EMPTY, (raw) =>
  Array.isArray(raw) && raw.every((item) => typeof item === "string") ? raw : null,
);

export const sortOrder = storedValue<SortKey>("watchlist.sort", "default", (raw) =>
  SORT_OPTIONS.some((option) => option.value === raw) ? (raw as SortKey) : null,
);

/** Stable id across reloads: the same symbol may trade on several venues. */
export function instrumentId(instrument: Instrument): string {
  return `${instrument.exchange}:${instrument.symbol}`;
}

export function toggleFavorite(instrument: Instrument) {
  const id = instrumentId(instrument);
  const current = favorites.get();
  favorites.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
}

/** Lowercase without Vietnamese diacritics: "Vàng" matches "vang". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/** Matches symbol, pair ("BTC/USDT") or company name; symbols that start with the query rank first. */
export function searchInstruments(items: Instrument[], query: string): Instrument[] {
  const q = fold(query.trim());
  if (!q) return items;
  const scored: { item: Instrument; score: number }[] = [];
  for (const item of items) {
    const symbols = [item.symbol, baseSymbol(item), displayName(item)].map(fold);
    const name = fold(item.name ?? "");
    let score = -1;
    if (symbols.some((s) => s === q)) score = 0;
    else if (symbols.some((s) => s.startsWith(q))) score = 1;
    else if (symbols.some((s) => s.includes(q))) score = 2;
    else if (name.includes(q)) score = 3;
    if (score >= 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => a.score - b.score).map(({ item }) => item);
}

/** Missing values always go last, whatever the direction. */
function byNumber(pick: (item: Instrument) => number | null | undefined, descending: boolean) {
  return (a: Instrument, b: Instrument) => {
    const x = pick(a);
    const y = pick(b);
    if (x == null || !Number.isFinite(x)) return y == null || !Number.isFinite(y) ? 0 : 1;
    if (y == null || !Number.isFinite(y)) return -1;
    return descending ? y - x : x - y;
  };
}

export function sortInstruments(items: Instrument[], key: SortKey): Instrument[] {
  switch (key) {
    case "gainers":
      return [...items].sort(byNumber((item) => item.change_pct, true));
    case "losers":
      return [...items].sort(byNumber((item) => item.change_pct, false));
    case "turnover":
      return [...items].sort(byNumber((item) => item.turnover_vnd, true));
    default:
      return items; // API order: by symbol
  }
}

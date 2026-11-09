import type { Instrument } from "@/lib/api";

const EXCHANGE_LABELS: Record<string, string> = {
  HOSE: "HOSE",
  HNX: "HNX",
  UPCOM: "UPCoM",
  BINANCE: "Binance",
};

export function exchangeLabel(exchange: string): string {
  return EXCHANGE_LABELS[exchange] ?? exchange;
}

/** "BTCUSDT" -> "BTC"; stock symbols are returned as-is. */
export function baseSymbol(instrument: Instrument): string {
  const { symbol, quote_currency: quote, asset_class: assetClass } = instrument;
  if (assetClass === "crypto" && symbol.endsWith(quote) && symbol.length > quote.length) {
    return symbol.slice(0, -quote.length);
  }
  return symbol;
}

/** Title shown above the chart: "FPT", "BTC/USDT". */
export function displayName(instrument: Instrument): string {
  return instrument.asset_class === "crypto"
    ? `${baseSymbol(instrument)}/${instrument.quote_currency}`
    : instrument.symbol;
}

/** Second line in the watchlist: company name, or pair + venue for crypto. */
export function subtitle(instrument: Instrument): string {
  if (instrument.asset_class === "crypto") {
    return `${displayName(instrument)} · ${exchangeLabel(instrument.exchange)}`;
  }
  return instrument.name ?? exchangeLabel(instrument.exchange);
}

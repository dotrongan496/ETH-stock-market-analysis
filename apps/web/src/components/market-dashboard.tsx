"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import ChartHeader from "@/components/chart-header";
import { ChartSkeleton, LoadingBar, StaleVeil } from "@/components/chart-loading";
import CompareChart, { type CompareEntry } from "@/components/compare-chart";
import InstrumentSidebar from "@/components/instrument-sidebar";
import PriceChart from "@/components/price-chart";
import {
  API_BASE_URL,
  errorMessage,
  fetchInstruments,
  fetchPrices,
  type AssetClass,
  type Instrument,
  type Interval,
  type PriceSeries,
} from "@/lib/api";
import { nextFreeSlot, type CompareSlot } from "@/lib/compare";
import { DEFAULT_USD_VND_RATE, parseRate } from "@/lib/format";
import { baseSymbol } from "@/lib/instrument";
import type { StockView } from "@/lib/price-limits";
import { DEFAULT_RANGE, yearsSpanned, type ChartRange } from "@/lib/range";

/** Price series kept in memory, so flipping between symbols / intervals is instant. */
const MAX_CACHED_SERIES = 30;
const RATE_DEBOUNCE_MS = 450;
const PREFETCH_DELAY_MS = 90;

interface InstrumentsState {
  requestKey: string;
  rate: number;
  items: Instrument[] | null;
  error: string | null;
}

interface SeriesState {
  cache: Record<string, PriceSeries>;
  order: string[]; // oldest first, for eviction
  /** Failed requests by series key; cleared by "Thử lại". */
  errors: Record<string, string>;
}

function addToCache(state: SeriesState, key: string, series: PriceSeries): SeriesState {
  const order = [...state.order.filter((k) => k !== key), key];
  const cache = { ...state.cache, [key]: series };
  while (order.length > MAX_CACHED_SERIES) {
    const evicted = order.shift();
    if (evicted !== undefined) delete cache[evicted];
  }
  const errors = { ...state.errors };
  delete errors[key];
  return { cache, order, errors };
}

export default function MarketDashboard() {
  const [rateInput, setRateInput] = useState(String(DEFAULT_USD_VND_RATE));
  const [rate, setRate] = useState(DEFAULT_USD_VND_RATE);
  const [tab, setTab] = useState<AssetClass>("stock");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareSlot[]>([]);
  const [stockView, setStockView] = useState<StockView>("value");
  const [chartInterval, setChartInterval] = useState<Interval>("1d");
  const [range, setRange] = useState<ChartRange>(DEFAULT_RANGE);
  const [reloadToken, setReloadToken] = useState(0);
  const [instrumentsState, setInstrumentsState] = useState<InstrumentsState | null>(null);
  const [seriesState, setSeriesState] = useState<SeriesState>({ cache: {}, order: [], errors: {} });

  // Apply a typed rate once the user pauses typing.
  useEffect(() => {
    const parsed = parseRate(rateInput);
    if (parsed === null || parsed === rate) return;
    const timer = setTimeout(() => setRate(parsed), RATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rateInput, rate]);

  // Watchlist with VND prices (crypto prices depend on the rate).
  const instrumentsKey = `${rate}|${reloadToken}`;
  useEffect(() => {
    const controller = new AbortController();
    fetchInstruments(rate, controller.signal)
      .then((items) => setInstrumentsState({ requestKey: instrumentsKey, rate, items, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInstrumentsState((previous) => ({
          requestKey: instrumentsKey,
          rate,
          items: previous?.items ?? null,
          error: errorMessage(error),
        }));
      });
    return () => controller.abort();
  }, [instrumentsKey, rate]);

  const instruments = instrumentsState?.items ?? null;
  const instrumentsError =
    instrumentsState?.requestKey === instrumentsKey ? instrumentsState.error : null;

  // Default selection: the first VN stock.
  const selected =
    instruments?.find((item) => item.symbol === selectedSymbol) ??
    instruments?.find((item) => item.asset_class === "stock") ??
    instruments?.[0] ??
    null;
  const symbol = selected?.symbol ?? null;

  // "Cổ phiếu VN → Thị trường" applies to VN stocks; it has daily candles only and no comparison.
  const marketView = stockView === "market" && selected?.asset_class === "stock";
  const interval: Interval = marketView ? "1d" : chartInterval;

  // Instruments drawn next to the main one (never the main one itself).
  const compared = (marketView ? [] : compare).flatMap((slot) => {
    const item = instruments?.find((inst) => inst.symbol === slot.symbol);
    return item && item.symbol !== symbol ? [{ ...slot, item }] : [];
  });

  // VND-quoted series do not depend on the USDT rate, so they are not refetched when it changes.
  const keyOf = (item: Instrument) =>
    [item.symbol, interval, item.quote_currency === "VND" ? "VND" : rate].join("|");
  const wanted = [...(selected ? [selected] : []), ...compared.map((c) => c.item)].map((item) => ({
    item,
    key: keyOf(item),
  }));
  const missing = wanted.filter(
    ({ key }) => !(key in seriesState.cache) && !(key in seriesState.errors),
  );

  // Requests are not aborted when another one lands (that would restart the rest); they are
  // only aborted when the dashboard unmounts.
  const inflight = useRef(new Map<string, AbortController>());
  const [retryTick, setRetryTick] = useState(0);
  const loadSeries = (item: Instrument, key: string, prefetch = false) => {
    if (inflight.current.has(key)) return;
    const controller = new AbortController();
    inflight.current.set(key, controller);
    const settle = () => {
      if (inflight.current.get(key) === controller) inflight.current.delete(key);
    };
    fetchPrices(item.symbol, interval, rate, controller.signal)
      .then((series) => {
        settle();
        setSeriesState((previous) => addToCache(previous, key, series));
      })
      .catch((error: unknown) => {
        settle();
        if (controller.signal.aborted) return;
        // A failed prefetch shows nothing; if the series is on screen by now, fetch it for real.
        if (prefetch) {
          setRetryTick((tick) => tick + 1);
          return;
        }
        setSeriesState((previous) => ({
          ...previous,
          errors: { ...previous.errors, [key]: errorMessage(error) },
        }));
      });
  };

  // Fetch every missing series that is on screen.
  const startFetches = useEffectEvent(() => {
    for (const { item, key } of missing) loadSeries(item, key);
  });
  const missingKey = missing.map(({ key }) => key).join(",");
  useEffect(() => {
    startFetches();
  }, [missingKey, reloadToken, retryTick]);

  // Prefetch: resting on a watchlist row (mouse or keyboard) loads its chart, so the click
  // shows it at once. The short delay skips rows the pointer only passes over.
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prefetch = (target: string | null) => {
    clearTimeout(prefetchTimer.current);
    const item = target === null ? null : instruments?.find((inst) => inst.symbol === target);
    if (!item) return;
    const key = keyOf(item);
    if (key in seriesState.cache || key in seriesState.errors) return;
    prefetchTimer.current = setTimeout(() => loadSeries(item, key, true), PREFETCH_DELAY_MS);
  };

  useEffect(() => {
    const requests = inflight.current;
    return () => {
      clearTimeout(prefetchTimer.current);
      requests.forEach((controller) => controller.abort());
      requests.clear();
    };
  }, []);

  const seriesKey = selected ? keyOf(selected) : null;
  const currentSeries = seriesKey ? seriesState.cache[seriesKey] : undefined;
  const seriesError = seriesKey ? (seriesState.errors[seriesKey] ?? null) : null;

  const selectSymbol = (next: string) => {
    setSelectedSymbol(next);
    setCompare((list) => list.filter((slot) => slot.symbol !== next));
  };
  const addCompare = (next: string) =>
    setCompare((list) => {
      const slot = nextFreeSlot(list);
      return slot === null || list.some((c) => c.symbol === next) ? list : [...list, { symbol: next, slot }];
    });
  const removeCompare = (target: string) =>
    setCompare((list) => list.filter((slot) => slot.symbol !== target));

  // Monthly candles: a window of days makes no sense, fall back to the latest month.
  const changeInterval = (next: Interval) => {
    setChartInterval(next);
    if (next === "1m" && range.unit === "day") setRange({ unit: "month", count: 1 });
  };

  // Hover menu of the "Cổ phiếu VN" tab; clicking the tab itself picks "Giá trị".
  const chooseStockView = (view: StockView) => {
    setTab("stock");
    setStockView(view);
    if (view === "market") {
      setChartInterval("1d"); // also the interval kept when going back to "Giá trị"
      // The board needs a VN stock: leave a crypto selection for the first stock.
      if (selected?.asset_class !== "stock") {
        const firstStock = instruments?.find((item) => item.asset_class === "stock");
        if (firstStock) setSelectedSymbol(firstStock.symbol);
      }
    }
  };

  // "Năm" wheel length: years covered by the data on screen (the previous series while loading).
  const shownSeries =
    currentSeries ?? seriesState.cache[seriesState.order[seriesState.order.length - 1]];
  const maxYears = Math.max(
    yearsSpanned(shownSeries?.bars ?? []),
    ...compared.map((c) => yearsSpanned(seriesState.cache[keyOf(c.item)]?.bars ?? [])),
  );

  const compareEntries: CompareEntry[] = [
    ...(selected ? [{ item: selected, slot: 0 }] : []),
    ...compared,
  ].map(({ item, slot }) => {
    const key = keyOf(item);
    return {
      id: item.symbol,
      label: baseSymbol(item),
      slot,
      series: seriesState.cache[key],
      error: seriesState.errors[key] ?? null,
      removable: slot !== 0,
    };
  });
  const comparing = compared.length > 0;

  const retry = () => {
    setSeriesState((previous) => ({ ...previous, errors: {} }));
    setReloadToken((token) => token + 1);
  };

  const chartHasData = seriesState.order.length > 0;
  let overlay: ReactNode = null;
  let loading = false;
  if (instruments === null && instrumentsError) {
    overlay = <ApiUnavailable message={instrumentsError} onRetry={retry} />;
  } else if (seriesError) {
    overlay = <ChartMessage title="Không tải được biểu đồ" detail={seriesError} onRetry={retry} />;
  } else if (!currentSeries) {
    // Previous candles stay visible underneath while new data loads.
    overlay = chartHasData ? <StaleVeil /> : <ChartSkeleton />;
    loading = true;
  } else if (currentSeries.bars.length === 0 && !comparing) {
    overlay = <ChartMessage title="Chưa có dữ liệu giá cho mã này" />;
  }
  if (comparing && compareEntries.some((entry) => !entry.series && !entry.error)) loading = true;

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <InstrumentSidebar
        instruments={instruments}
        error={instrumentsError}
        tab={tab}
        onTabChange={setTab}
        stockView={stockView}
        onStockViewChange={chooseStockView}
        selected={symbol}
        onSelect={selectSymbol}
        onPrefetch={prefetch}
        onRetry={retry}
      />
      <main className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <ChartHeader
          instrument={selected}
          appliedRate={instrumentsState?.rate ?? rate}
          rateInput={rateInput}
          rateValid={parseRate(rateInput) !== null}
          onRateInput={setRateInput}
          interval={interval}
          onIntervalChange={changeInterval}
          range={range}
          onRangeChange={setRange}
          maxYears={maxYears}
          instruments={instruments}
          compare={compared.map(({ symbol: s, slot }) => ({ symbol: s, slot }))}
          onCompareAdd={addCompare}
          onCompareRemove={removeCompare}
          onCompareClear={() => setCompare([])}
          marketView={marketView}
        />
        <section aria-label="Biểu đồ giá" className="relative min-h-[420px] flex-1 md:min-h-0">
          {comparing ? (
            <CompareChart
              entries={compareEntries}
              interval={interval}
              range={range}
              onRemove={removeCompare}
              onRetry={retry}
            />
          ) : (
            <PriceChart
              series={currentSeries}
              range={range}
              view={marketView ? "market" : "value"}
            />
          )}
          {overlay}
          {loading && <LoadingBar />}
        </section>
      </main>
    </div>
  );
}

function ChartMessage({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/80 p-6 backdrop-blur-[2px]">
      <div className="max-w-md rounded-lg border border-line bg-panel p-5 text-center shadow-xl shadow-black/40">
        <p className="font-medium">{title}</p>
        {detail && <p className="mt-1.5 text-sm text-muted">{detail}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
          >
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

function ApiUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas p-6">
      <div className="max-w-lg rounded-lg border border-line bg-panel p-6 shadow-xl shadow-black/40">
        <p className="font-medium">Không kết nối được tới backend</p>
        <p className="mt-1.5 text-sm text-muted">{message}</p>
        <p className="mt-4 text-sm text-muted">
          Chạy FastAPI ở thư mục gốc của repo, rồi bấm “Thử lại”:
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-canvas p-3 text-xs text-ink">
          uv run --package eth-api uvicorn eth_api.main:create_app --factory --port 8000
        </pre>
        <p className="mt-2 text-xs text-muted">
          Địa chỉ API đang dùng: <code className="text-ink">{API_BASE_URL}</code> (đổi bằng biến{" "}
          <code className="text-ink">NEXT_PUBLIC_API_BASE_URL</code>).
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}

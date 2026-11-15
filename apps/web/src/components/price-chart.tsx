"use client";

import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useEffect, useEffectEvent, useRef } from "react";

import type { Interval, PriceBar, PriceSeries } from "@/lib/api";
import { chromeOptions, formatTimeLabel, tickMarkFormatter } from "@/lib/chart";
import { formatPrice, formatVnd, formatVolume } from "@/lib/format";
import { currentTheme, useTheme } from "@/lib/theme";
import { rangeStartIndex, type ChartRange } from "@/lib/range";

/** Fewer candles than this keep this width (empty space after them) instead of stretching. */
const MIN_VISIBLE_SLOTS = 10;

// Candle colors are the same in both themes; the chart chrome follows the theme.
const COLORS = {
  up: "#22c55e",
  down: "#ef4444",
  upVolume: "rgba(34, 197, 94, 0.5)",
  downVolume: "rgba(239, 68, 68, 0.5)",
} as const;

// Explicit per-bar colors: a candle is "up" when close >= open.
function toCandle(bar: PriceBar): CandlestickData<Time> {
  const color = bar.close >= bar.open ? COLORS.up : COLORS.down;
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    color,
    borderColor: color,
    wickColor: color,
  };
}

function toVolume(bar: PriceBar): HistogramData<Time> {
  return {
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? COLORS.upVolume : COLORS.downVolume,
  };
}

/** Show the last `range` of bars, leaving a little room after the latest candle. */
function applyRange(chart: IChartApi, bars: PriceBar[], interval: Interval, range: ChartRange) {
  if (bars.length === 0) return;
  const last = bars.length - 1;
  const first = rangeStartIndex(bars, interval, range);
  const padding = Math.max(1, Math.round((last - first + 1) * 0.04));
  const to = Math.max(last + 0.5 + padding, first - 0.5 + MIN_VISIBLE_SLOTS);
  chart.timeScale().setVisibleLogicalRange({ from: first - 0.5, to });
}

function setText(root: HTMLElement, field: string, text: string) {
  const element = root.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (element) element.textContent = text;
}

interface PriceChartProps {
  /** Data to draw. `undefined` while loading: the previous candles stay on screen. */
  series: PriceSeries | undefined;
  range: ChartRange;
}

export default function PriceChart({ series, range }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const shownRef = useRef<{ key: string; bars: PriceBar[]; interval: Interval } | null>(null);
  const theme = useTheme();

  const applyRangeToShown = useEffectEvent(() => {
    const chart = chartRef.current;
    const shown = shownRef.current;
    if (chart && shown) applyRange(chart, shown.bars, shown.interval, range);
  });

  const updateTooltip = useEffectEvent((param: MouseEventParams<Time>) => {
    const tooltip = tooltipRef.current;
    const container = containerRef.current;
    const candles = candlesRef.current;
    const volume = volumeRef.current;
    if (!tooltip || !container || !candles || !volume) return;

    const candle = param.seriesData.get(candles) as CandlestickData<Time> | undefined;
    const point = param.point;
    if (!point || !candle || point.x < 0 || point.y < 0) {
      tooltip.style.display = "none";
      return;
    }
    const traded = param.seriesData.get(volume) as HistogramData<Time> | undefined;
    const interval = shownRef.current?.interval ?? "1d";

    setText(
      tooltip,
      "date",
      `${interval === "1m" ? "Tháng" : "Ngày"} ${formatTimeLabel(candle.time, interval)}`,
    );
    setText(tooltip, "open", formatVnd(candle.open));
    setText(tooltip, "high", formatVnd(candle.high));
    setText(tooltip, "low", formatVnd(candle.low));
    setText(tooltip, "close", formatVnd(candle.close));
    setText(tooltip, "volume", traded ? formatVolume(traded.value) : "—");
    const close = tooltip.querySelector<HTMLElement>('[data-field="close"]');
    if (close) close.style.color = candle.close >= candle.open ? COLORS.up : COLORS.down;

    // Follow the cursor, flipping sides near the right/bottom edges.
    tooltip.style.display = "block";
    const gap = 14;
    let x = point.x + gap;
    let y = point.y + gap;
    if (x + tooltip.offsetWidth > container.clientWidth - 4) x = point.x - tooltip.offsetWidth - gap;
    if (y + tooltip.offsetHeight > container.clientHeight - 4) y = point.y - tooltip.offsetHeight - gap;
    tooltip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  });

  // Create the chart once; it resizes itself with its container (autoSize).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        fontSize: 12,
        fontFamily: getComputedStyle(container).fontFamily,
        attributionLogo: true,
      },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: {
        rightOffset: 4,
        minBarSpacing: 0.5,
        tickMarkFormatter,
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "vi-VN", timeFormatter: (time: Time) => formatTimeLabel(time, "1d") },
      kineticScroll: { mouse: true, touch: true },
    });
    chart.applyOptions(chromeOptions(currentTheme()));

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceFormat: {
        type: "custom",
        minMove: 0.0001,
        // The bottom margin kept free for volume can push the scale below zero on wide
        // ranges (e.g. BTC monthly, "Tất cả"): prices are never negative, so hide those labels.
        formatter: (price: number) => (price < 0 ? "" : formatPrice(price)),
        tickmarksFormatter: (prices: number[]) =>
          prices.map((price) => (price < 0 ? "" : formatPrice(price))),
      },
    });

    // Volume on its own invisible scale, squeezed into the bottom 20% of the chart.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const onCrosshairMove = (param: MouseEventParams<Time>) => updateTooltip(param);
    chart.subscribeCrosshairMove(onCrosshairMove);

    chartRef.current = chart;
    candlesRef.current = candles;
    volumeRef.current = volume;

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candlesRef.current = null;
      volumeRef.current = null;
      shownRef.current = null;
    };
  }, []);

  // New data. Same symbol + interval (e.g. another USDT rate): keep the user's zoom/pan.
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    const volume = volumeRef.current;
    if (!series || !chart || !candles || !volume) return;

    const key = `${series.symbol}|${series.interval}`;
    const keepView =
      shownRef.current?.key === key ? chart.timeScale().getVisibleLogicalRange() : null;

    candles.setData(series.bars.map(toCandle));
    volume.setData(series.bars.map(toVolume));
    chart.applyOptions({
      localization: { timeFormatter: (time: Time) => formatTimeLabel(time, series.interval) },
    });
    shownRef.current = { key, bars: series.bars, interval: series.interval };

    if (keepView) chart.timeScale().setVisibleLogicalRange(keepView);
    else applyRangeToShown();
  }, [series]);

  // Theme switch flipped.
  useEffect(() => {
    if (theme) chartRef.current?.applyOptions(chromeOptions(theme));
  }, [theme]);

  // Range picker (N ngày / tháng / năm).
  useEffect(() => {
    applyRangeToShown();
  }, [range]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 hidden min-w-52 rounded-lg border border-line bg-raised/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur-sm"
      >
        <div data-field="date" className="mb-1.5 font-semibold text-ink" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
          <dt className="text-muted">Mở</dt>
          <dd data-field="open" className="text-right" />
          <dt className="text-muted">Cao</dt>
          <dd data-field="high" className="text-right" />
          <dt className="text-muted">Thấp</dt>
          <dd data-field="low" className="text-right" />
          <dt className="text-muted">Đóng</dt>
          <dd data-field="close" className="text-right font-semibold" />
          <dt className="text-muted">Khối lượng</dt>
          <dd data-field="volume" className="text-right" />
        </dl>
      </div>
    </div>
  );
}

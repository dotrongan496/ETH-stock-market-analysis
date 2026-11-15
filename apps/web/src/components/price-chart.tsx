"use client";

import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useEffect, useEffectEvent, useRef } from "react";

import type { Interval, PriceBar, PriceSeries } from "@/lib/api";
import { chromeOptions, formatTimeLabel, tickMarkFormatter, timeToIso } from "@/lib/chart";
import { formatPct, formatPrice, formatVnd, formatVolume } from "@/lib/format";
import {
  bandPct,
  priceLimits,
  priceState,
  type PriceLimits,
  type PriceState,
  type StockView,
} from "@/lib/price-limits";
import { rangeStartIndex, type ChartRange } from "@/lib/range";
import { currentTheme, useTheme } from "@/lib/theme";

/** Fewer candles than this keep this width (empty space after them) instead of stretching. */
const MIN_VISIBLE_SLOTS = 10;

// Up / down candle colors are the same in both themes; the chart chrome follows the theme.
const COLORS = {
  up: "#22c55e",
  down: "#ef4444",
} as const;

/** "Thị trường" colors, read from the theme tokens (--color-ceil / --color-floor / --color-flat). */
function boardColors(): Record<PriceState, string> {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ceil: read("--color-ceil", "#d946ef"),
    floor: read("--color-floor", "#38bdf8"),
    ref: read("--color-flat", "#eab308"),
    up: COLORS.up,
    down: COLORS.down,
  };
}

/** "#rrggbb" -> "rgba(r, g, b, alpha)"; other formats are returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Board state of every bar vs the previous close (its reference price); null for the first bar. */
interface Mark {
  limits: PriceLimits;
  state: PriceState;
}

function boardMarks(bars: PriceBar[], exchange: string): (Mark | null)[] {
  return bars.map((bar, index) => {
    const limits = index > 0 ? priceLimits(bars[index - 1].close, exchange) : null;
    return limits ? { limits, state: priceState(bar.close, limits) } : null;
  });
}

/** Candle color: by close vs open ("Giá trị"), or by close vs reference ("Thị trường"). */
function barColor(bar: PriceBar, mark: Mark | null | undefined, palette: Record<PriceState, string>) {
  if (mark) return palette[mark.state];
  return bar.close >= bar.open ? COLORS.up : COLORS.down;
}

function toCandle(bar: PriceBar, color: string): CandlestickData<Time> {
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

/** Show the last `range` of bars, leaving a little room after the latest candle. */
function applyRange(chart: IChartApi, bars: PriceBar[], interval: Interval, range: ChartRange) {
  if (bars.length === 0) return;
  const last = bars.length - 1;
  const first = rangeStartIndex(bars, interval, range);
  const padding = Math.max(1, Math.round((last - first + 1) * 0.04));
  const to = Math.max(last + 0.5 + padding, first - 0.5 + MIN_VISIBLE_SLOTS);
  chart.timeScale().setVisibleLogicalRange({ from: first - 0.5, to });
}

function setText(root: HTMLElement, field: string, text: string, color?: string) {
  const element = root.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (!element) return;
  element.textContent = text;
  if (color !== undefined) element.style.color = color;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatPrice(Math.abs(value))}`;
}

interface Shown {
  key: string;
  bars: PriceBar[];
  interval: Interval;
  /** Index of each bar by date, for the tooltip. */
  index: Map<string, number>;
  /** Present in the "Thị trường" view. */
  marks: (Mark | null)[] | null;
  palette: Record<PriceState, string>;
}

interface PriceChartProps {
  /** Data to draw. `undefined` while loading: the previous candles stay on screen. */
  series: PriceSeries | undefined;
  range: ChartRange;
  /**
   * "market": VN price board colors. Each candle is colored against its reference price
   * (previous close): purple at the ceiling, light blue at the floor, yellow when unchanged.
   * The latest session's ceiling / floor / reference are drawn as lines. Daily VN stocks only.
   */
  view?: StockView;
}

export default function PriceChart({ series, range, view = "value" }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const limitLinesRef = useRef<IPriceLine[]>([]);
  /** Latest session's limits: kept inside the price scale so the three lines stay visible. */
  const latestLimitsRef = useRef<PriceLimits | null>(null);
  const shownRef = useRef<Shown | null>(null);
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
    const shown = shownRef.current;
    if (!tooltip || !container || !candles || !volume || !shown) return;

    const candle = param.seriesData.get(candles) as CandlestickData<Time> | undefined;
    const point = param.point;
    if (!point || !candle || point.x < 0 || point.y < 0) {
      tooltip.style.display = "none";
      return;
    }
    const traded = param.seriesData.get(volume) as HistogramData<Time> | undefined;
    const interval = shown.interval;
    const barIndex = shown.index.get(timeToIso(candle.time));
    const bar = barIndex === undefined ? undefined : shown.bars[barIndex];
    const mark = barIndex === undefined ? null : (shown.marks?.[barIndex] ?? null);

    setText(
      tooltip,
      "date",
      `${interval === "1m" ? "Tháng" : "Ngày"} ${formatTimeLabel(candle.time, interval)}`,
    );
    setText(tooltip, "open", formatVnd(candle.open));
    setText(tooltip, "high", formatVnd(candle.high));
    setText(tooltip, "low", formatVnd(candle.low));
    setText(
      tooltip,
      "close",
      formatVnd(candle.close),
      bar ? barColor(bar, mark, shown.palette) : undefined,
    );
    setText(tooltip, "volume", traded ? formatVolume(traded.value) : "—");

    tooltip.querySelectorAll<HTMLElement>("[data-board]").forEach((rows) => {
      rows.style.display = shown.marks ? "contents" : "none";
    });
    if (shown.marks) {
      const { palette } = shown;
      if (mark) {
        const diff = candle.close - mark.limits.reference;
        setText(tooltip, "ref", formatVnd(mark.limits.reference));
        setText(tooltip, "ceil", formatVnd(mark.limits.ceiling));
        setText(tooltip, "floor", formatVnd(mark.limits.floor));
        setText(
          tooltip,
          "change",
          `${signed(diff)} (${formatPct((diff / mark.limits.reference) * 100)})`,
          palette[mark.state],
        );
      } else {
        for (const field of ["ref", "ceil", "floor", "change"]) setText(tooltip, field, "—");
      }
    }

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
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        const limits = latestLimitsRef.current;
        if (!info?.priceRange || !limits) return info;
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, limits.floor),
            maxValue: Math.max(info.priceRange.maxValue, limits.ceiling),
          },
        };
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
      limitLinesRef.current = [];
      latestLimitsRef.current = null;
    };
  }, []);

  // New data, other view or theme. Same symbol + interval (e.g. another USDT rate, "Giá trị" ->
  // "Thị trường"): keep the user's zoom/pan.
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    const volume = volumeRef.current;
    if (!series || !chart || !candles || !volume) return;

    const key = `${series.symbol}|${series.interval}`;
    const keepView =
      shownRef.current?.key === key ? chart.timeScale().getVisibleLogicalRange() : null;

    const board =
      view === "market" && series.interval === "1d" && bandPct(series.exchange) !== null;
    const marks = board ? boardMarks(series.bars, series.exchange) : null;
    const palette = boardColors();

    candles.setData(
      series.bars.map((bar, i) => toCandle(bar, barColor(bar, marks?.[i], palette))),
    );
    volume.setData(
      series.bars.map((bar, i) => ({
        time: bar.time,
        value: bar.volume,
        color: withAlpha(barColor(bar, marks?.[i], palette), 0.5),
      })),
    );

    // Ceiling / floor / reference of the latest session.
    for (const line of limitLinesRef.current) candles.removePriceLine(line);
    const latest = marks?.[marks.length - 1]?.limits ?? null;
    latestLimitsRef.current = latest;
    limitLinesRef.current = latest
      ? [
          { price: latest.ceiling, color: palette.ceil, title: "Trần" },
          { price: latest.floor, color: palette.floor, title: "Sàn" },
          { price: latest.reference, color: palette.ref, title: "TC" },
        ].map((line) =>
          candles.createPriceLine({
            ...line,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          }),
        )
      : [];
    // Up / down price line of the last candle would sit on top of the TC / Trần / Sàn labels.
    candles.applyOptions({ priceLineVisible: !latest });

    chart.applyOptions({
      localization: { timeFormatter: (time: Time) => formatTimeLabel(time, series.interval) },
    });
    shownRef.current = {
      key,
      bars: series.bars,
      interval: series.interval,
      index: new Map(series.bars.map((bar, i) => [bar.time, i])),
      marks,
      palette,
    };

    if (keepView) chart.timeScale().setVisibleLogicalRange(keepView);
    else applyRangeToShown();
  }, [series, view, theme]);

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
          <div data-board className="hidden">
            <dt className="text-muted">Tham chiếu</dt>
            <dd data-field="ref" className="text-right text-flat" />
            <dt className="text-muted">Trần</dt>
            <dd data-field="ceil" className="text-right text-ceil" />
            <dt className="text-muted">Sàn</dt>
            <dd data-field="floor" className="text-right text-floor" />
          </div>
          <dt className="text-muted">Mở</dt>
          <dd data-field="open" className="text-right" />
          <dt className="text-muted">Cao</dt>
          <dd data-field="high" className="text-right" />
          <dt className="text-muted">Thấp</dt>
          <dd data-field="low" className="text-right" />
          <dt className="text-muted">Đóng</dt>
          <dd data-field="close" className="text-right font-semibold" />
          <div data-board className="hidden">
            <dt className="text-muted">Thay đổi</dt>
            <dd data-field="change" className="text-right" />
          </div>
          <dt className="text-muted">Khối lượng</dt>
          <dd data-field="volume" className="text-right" />
        </dl>
      </div>
    </div>
  );
}

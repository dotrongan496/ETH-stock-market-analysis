"use client";

import {
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import type { Interval, PriceSeries } from "@/lib/api";
import { chromeMuted, chromeOptions, formatTimeLabel, tickMarkFormatter, timeToIso } from "@/lib/chart";
import { rebase, seriesColor, valueAt } from "@/lib/compare";
import { changeDirection, formatPct } from "@/lib/format";
import type { ChartRange } from "@/lib/range";
import { currentTheme, useTheme } from "@/lib/theme";

export interface CompareEntry {
  /** Instrument symbol. */
  id: string;
  label: string;
  /** Color slot, see lib/compare.ts. */
  slot: number;
  /** `undefined` while loading. */
  series: PriceSeries | undefined;
  error: string | null;
  /** The main instrument (slot 0) is changed from the watchlist, not removed here. */
  removable: boolean;
}

interface CompareChartProps {
  entries: ReadonlyArray<CompareEntry>;
  interval: Interval;
  range: ChartRange;
  onRemove: (id: string) => void;
  onRetry: () => void;
}

/** What the lines depend on, as a string: cached series objects are replaced, never mutated. */
function seriesSignature(series: PriceSeries | undefined): string {
  if (!series) return "-";
  const last = series.bars[series.bars.length - 1];
  return [series.interval, series.usd_vnd_rate, series.bars.length, last?.time, last?.close].join(":");
}

export default function CompareChart({ entries, interval, range, onRemove, onRetry }: CompareChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const linesRef = useRef<{ slot: number; line: ISeriesApi<"Line"> }[]>([]);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const theme = useTheme();

  const signature = [
    interval,
    range.unit,
    range.count,
    ...entries.map((entry) => `${entry.id}@${entry.slot}=${seriesSignature(entry.series)}`),
  ].join("|");
  // Recomputed only when the data really changes, not on every crosshair move.
  const points = useMemo(
    () => rebase(entries.map((entry) => entry.series?.bars ?? []), interval, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` covers entries/range
    [signature],
  );

  const drawLines = useEffectEvent(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const { line } of linesRef.current) chart.removeSeries(line);
    linesRef.current = entries.map((entry, index) => {
      const line = chart.addSeries(LineSeries, {
        color: seriesColor(entry.slot),
        lineWidth: entry.slot === 0 ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        priceFormat: { type: "custom", minMove: 0.01, formatter: (value: number) => formatPct(value) },
      });
      line.setData(points[index].map((point) => ({ time: point.time, value: point.value })));
      if (index === 0) {
        line.createPriceLine({
          price: 0,
          color: chromeMuted(currentTheme()),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
        });
      }
      return { slot: entry.slot, line };
    });
    chart.applyOptions({
      localization: { timeFormatter: (time: Time) => formatTimeLabel(time, interval) },
    });
    chart.timeScale().fitContent();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: { fontSize: 12, fontFamily: getComputedStyle(container).fontFamily, attributionLogo: true },
      rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { rightOffset: 4, minBarSpacing: 0.5, tickMarkFormatter },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "vi-VN" },
      kineticScroll: { mouse: true, touch: true },
    });
    chart.applyOptions(chromeOptions(currentTheme()));
    const onMove = (param: MouseEventParams<Time>) =>
      setHoverTime(param.time !== undefined && param.point ? timeToIso(param.time) : null);
    chart.subscribeCrosshairMove(onMove);
    chartRef.current = chart;
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      linesRef.current = [];
    };
  }, []);

  useEffect(() => {
    drawLines();
  }, [points]);

  // Theme flipped: chrome and the line colors (CSS variables) both change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!theme || !chart) return;
    chart.applyOptions(chromeOptions(theme));
    for (const { slot, line } of linesRef.current) line.applyOptions({ color: seriesColor(slot) });
    linesRef.current[0]?.line.priceLines().forEach((priceLine) =>
      priceLine.applyOptions({ color: chromeMuted(theme) }),
    );
  }, [theme]);

  const hoverLabel = hoverTime ? formatTimeLabel(hoverTime, interval) : null;
  const start = points.find((list) => list.length > 0)?.[0]?.time;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-5rem)] rounded-lg border border-line bg-raised/90 px-3 py-2 text-xs shadow-lg shadow-black/30 backdrop-blur-sm">
        <p className="mb-1.5 text-muted">
          {hoverLabel
            ? `${interval === "1m" ? "Tháng" : "Ngày"} ${hoverLabel}`
            : start
              ? `Thay đổi từ ${formatTimeLabel(start, interval)}`
              : "So sánh % thay đổi"}
        </p>
        <ul className="space-y-1">
          {entries.map((entry, index) => {
            const point = valueAt(points[index], hoverTime);
            const direction = changeDirection(point?.value);
            return (
              <li key={entry.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ background: `var(--series-${entry.slot})`, height: entry.slot === 0 ? 3 : 2 }}
                />
                <span className={`min-w-10 ${entry.slot === 0 ? "font-semibold text-ink" : "text-ink"}`}>
                  {entry.label}
                </span>
                <span className="ml-auto pl-3 text-right tabular-nums">
                  {entry.error ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      title={entry.error}
                      className="pointer-events-auto text-down hover:underline"
                    >
                      Lỗi · thử lại
                    </button>
                  ) : !entry.series ? (
                    <span className="inline-block h-2.5 w-10 animate-pulse rounded-sm bg-muted/25 align-middle">
                      <span className="sr-only">Đang tải…</span>
                    </span>
                  ) : point ? (
                    <span
                      className={
                        direction === "up" ? "text-up" : direction === "down" ? "text-down" : "text-muted"
                      }
                    >
                      {formatPct(point.value)}
                    </span>
                  ) : (
                    <span className="text-muted" title="Không có dữ liệu trong khoảng thời gian này">
                      —
                    </span>
                  )}
                </span>
                {!entry.removable && <span aria-hidden className="-mr-1 size-5 shrink-0" />}
                {entry.removable && (
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    aria-label={`Bỏ ${entry.label} khỏi so sánh`}
                    title="Bỏ khỏi so sánh"
                    className="pointer-events-auto -mr-1 grid size-5 place-items-center rounded text-sm leading-none text-muted hover:bg-canvas hover:text-ink"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

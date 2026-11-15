// Chart loading states, quiet on purpose (like trading terminals): no spinner or text.
// - LoadingBar: a thin sliding line on the chart's top edge. It fades in only when a load
//   takes longer than a blink (CSS delay), so cached / prefetched data shows no loader at all.
// - StaleVeil: while another symbol loads, the previous candles stay on screen; if the wait
//   gets long they are dimmed a little, so they are not mistaken for the new symbol.
// - ChartSkeleton: first load, nothing to show yet: faint candles in the chart's place.

const SR_TEXT = "Đang tải dữ liệu…";

export function LoadingBar() {
  return (
    <div role="status" className="loading-bar pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden">
      <span className="sr-only">{SR_TEXT}</span>
    </div>
  );
}

export function StaleVeil() {
  return <div aria-hidden className="loading-veil pointer-events-none absolute inset-0 z-20 bg-canvas/45" />;
}

interface SkeletonCandle {
  x: number;
  top: number;
  bottom: number;
  high: number;
  low: number;
}

const CANDLE_COUNT = 56;
const CANDLE_STEP = 10;
const VIEW_HEIGHT = 200;

// Fixed pseudo-random walk (seeded, so server and client render the same shape).
const SKELETON_CANDLES: SkeletonCandle[] = (() => {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let price = 100;
  const raw = Array.from({ length: CANDLE_COUNT }, (_, index) => {
    const open = price;
    const close = open + (rand() - 0.45) * 9;
    price = close;
    return {
      index,
      open,
      close,
      high: Math.max(open, close) + rand() * 4,
      low: Math.min(open, close) - rand() * 4,
    };
  });
  const max = Math.max(...raw.map((c) => c.high));
  const min = Math.min(...raw.map((c) => c.low));
  const y = (value: number) => 8 + ((max - value) / (max - min)) * (VIEW_HEIGHT - 16);
  return raw.map((c) => ({
    x: c.index * CANDLE_STEP + CANDLE_STEP / 2,
    top: y(Math.max(c.open, c.close)),
    bottom: Math.max(y(Math.min(c.open, c.close)), y(Math.max(c.open, c.close)) + 1.5),
    high: y(c.high),
    low: y(c.low),
  }));
})();

export function ChartSkeleton() {
  return (
    <div aria-hidden className="loading-skeleton pointer-events-none absolute inset-0 z-20 bg-canvas">
      <svg
        viewBox={`0 0 ${CANDLE_COUNT * CANDLE_STEP} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute left-4 top-[12%] h-[76%] w-[calc(100%-5.5rem)] animate-pulse text-muted/20"
      >
        {SKELETON_CANDLES.map((c) => (
          <g key={c.x} fill="currentColor" stroke="currentColor">
            <line x1={c.x} x2={c.x} y1={c.high} y2={c.low} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={c.x - 3} y={c.top} width={6} height={c.bottom - c.top} stroke="none" />
          </g>
        ))}
      </svg>
    </div>
  );
}

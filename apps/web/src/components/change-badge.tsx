import { changeDirection, formatPct } from "@/lib/format";
import { STATE_BADGE, STATE_LABEL, type PriceState } from "@/lib/price-limits";

const TONES = {
  up: "bg-up/15 text-up",
  down: "bg-down/15 text-down",
  // Vietnamese boards show unchanged prices in yellow ("đứng giá").
  flat: "bg-flat/15 text-flat",
  none: "bg-muted/10 text-muted",
} as const;

interface ChangeBadgeProps {
  value: number | null;
  size?: "sm" | "md";
  /** Price board state ("Thị trường"): colors ceiling purple, floor light blue, reference yellow. */
  state?: PriceState | null;
}

export default function ChangeBadge({ value, size = "sm", state }: ChangeBadgeProps) {
  const direction = changeDirection(value);
  const rising = state ? state === "up" || state === "ceil" : direction === "up";
  const falling = state ? state === "down" || state === "floor" : direction === "down";
  const arrow = rising ? "▲" : falling ? "▼" : null;
  const tone = state ? STATE_BADGE[state] : TONES[direction ?? "none"];
  return (
    <span
      title={state ? STATE_LABEL[state] : undefined}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium tabular-nums ${
        size === "md" ? "text-sm" : "text-xs"
      } ${tone}`}
    >
      {arrow && (
        <span aria-hidden className="text-[0.65em]">
          {arrow}
        </span>
      )}
      {formatPct(value)}
    </span>
  );
}

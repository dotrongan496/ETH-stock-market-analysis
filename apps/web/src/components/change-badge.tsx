import { changeDirection, formatPct } from "@/lib/format";

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
}

export default function ChangeBadge({ value, size = "sm" }: ChangeBadgeProps) {
  const direction = changeDirection(value);
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium tabular-nums ${
        size === "md" ? "text-sm" : "text-xs"
      } ${TONES[direction ?? "none"]}`}
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

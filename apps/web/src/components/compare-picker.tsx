"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { Instrument } from "@/lib/api";
import { MAX_COMPARE, type CompareSlot } from "@/lib/compare";
import { baseSymbol, subtitle } from "@/lib/instrument";
import { searchInstruments } from "@/lib/watchlist";

interface ComparePickerProps {
  instruments: Instrument[] | null;
  /** Main instrument (from the watchlist); never offered here. */
  main: Instrument | null;
  compare: ReadonlyArray<CompareSlot>;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onClear: () => void;
}

/** "So sánh: [ETH ×] [VNM ×] [+ Thêm mã]" with a searchable popover. */
export default function ComparePicker({
  instruments,
  main,
  compare,
  onAdd,
  onRemove,
  onClear,
}: ComparePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bySymbol = (symbol: string) => instruments?.find((item) => item.symbol === symbol);
  const full = compare.length >= MAX_COMPARE;
  const candidates = searchInstruments(
    (instruments ?? []).filter(
      (item) => item.symbol !== main?.symbol && !compare.some((c) => c.symbol === item.symbol),
    ),
    query,
  );

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) buttonRef.current?.focus();
  };

  const dismiss = useEffectEvent((refocus: boolean) => close(refocus));

  // Click outside / Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) dismiss(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const add = (item: Instrument) => {
    onAdd(item.symbol);
    close(true);
  };

  return (
    <div ref={rootRef} className="relative mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted">So sánh:</span>
      {compare.map(({ symbol, slot }) => {
        const item = bySymbol(symbol);
        const label = item ? baseSymbol(item) : symbol;
        return (
          <span
            key={symbol}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-raised pl-2 pr-0.5 text-ink"
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--series-${slot})` }} />
            {label}
            <button
              type="button"
              onClick={() => onRemove(symbol)}
              aria-label={`Bỏ ${label} khỏi so sánh`}
              className="grid size-5 place-items-center rounded-full text-sm leading-none text-muted hover:bg-canvas hover:text-ink"
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        disabled={full || !main}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={full ? `Tối đa ${MAX_COMPARE} mã so sánh` : "Vẽ thêm mã khác lên cùng biểu đồ, quy về %"}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line px-2.5 text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <span aria-hidden className="text-sm leading-none">+</span>
        {compare.length === 0 ? "Thêm mã để so sánh" : "Thêm mã"}
      </button>
      {compare.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="h-6 px-1.5 text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Bỏ so sánh
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Chọn mã để so sánh"
          className="absolute left-0 top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-panel p-2 shadow-xl shadow-black/40"
        >
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && candidates[0]) {
                event.preventDefault();
                add(candidates[0]);
              }
            }}
            placeholder="Tìm mã cổ phiếu hoặc crypto…"
            aria-label="Tìm mã để so sánh"
            autoComplete="off"
            spellCheck={false}
            className="mb-1.5 h-8 w-full rounded-md border border-line bg-canvas px-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent"
          />
          <ul className="max-h-72 overflow-y-auto">
            {candidates.length === 0 && (
              <li className="px-2 py-4 text-center text-muted">Không còn mã phù hợp.</li>
            )}
            {candidates.map((item) => (
              <li key={`${item.exchange}:${item.symbol}`}>
                <button
                  type="button"
                  onClick={() => add(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{baseSymbol(item)}</span>
                    <span className="block truncate text-muted">{subtitle(item)}</span>
                  </span>
                  <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {item.asset_class === "crypto" ? "Crypto" : "Cổ phiếu"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 border-t border-line px-1 pt-1.5 text-[11px] text-muted">
            Các đường bắt đầu cùng mốc 0% ở đầu khoảng thời gian đang xem.
            {compare.length > 0 && ` Còn thêm được ${MAX_COMPARE - compare.length} mã.`}
          </p>
        </div>
      )}
    </div>
  );
}

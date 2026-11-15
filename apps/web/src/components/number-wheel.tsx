"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface WheelOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

interface NumberWheelProps<T extends string | number> {
  label: string;
  options: ReadonlyArray<WheelOption<T>>;
  /** Selected value; `null` when none of the options matches. */
  value: T | null;
  onChange: (value: T) => void;
}

/** Quiet time after the last scroll event before the centered item is committed. */
const SETTLE_MS = 120;
/** Vertical wheel distance (px) per one-step move; a mouse notch is ~100px. */
const WHEEL_STEP_PX = 40;
/** Mouse drag shorter than this is still a click. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Horizontal scroll wheel: the item under the center marker is the selection.
 * Scroll / swipe / drag / mouse wheel and let go: the centered item is committed.
 * Clicking an item or using ←/→ selects directly.
 */
export default function NumberWheel<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: NumberWheelProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelTarget = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const mounted = useRef(false);
  // Item under the marker while the user is scrolling; null when idle.
  const [live, setLive] = useState<number | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const highlighted = live ?? selectedIndex;

  const latest = useRef({ options, selectedIndex, onChange });
  useLayoutEffect(() => {
    latest.current = { options, selectedIndex, onChange };
  });

  // Bring the selection under the marker: instantly on first paint / new option list, else animated.
  const optionsKey = options.map((option) => option.value).join("|");
  const shownKey = useRef(optionsKey);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || selectedIndex < 0) return;
    const jump = !mounted.current || shownKey.current !== optionsKey;
    mounted.current = true;
    shownKey.current = optionsKey;
    scrollToIndex(scroller, selectedIndex, jump ? "instant" : "smooth");
  }, [selectedIndex, optionsKey]);

  // Native listeners: a non-passive wheel handler (to keep the page from scrolling) and mouse drag.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let wheelDelta = 0;
    let drag: { x: number; left: number; moved: boolean } | null = null;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return; // horizontal swipe: native scroll
      event.preventDefault();
      wheelDelta += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      if (Math.abs(wheelDelta) < WHEEL_STEP_PX) return;
      const step = Math.sign(wheelDelta);
      wheelDelta = 0;
      const from = wheelTarget.current ?? nearestIndex(scroller);
      const next = clamp(from + step, 0, latest.current.options.length - 1);
      wheelTarget.current = next;
      scrollToIndex(scroller, next, "smooth");
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag = { x: event.clientX, left: scroller.scrollLeft, moved: false };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        scroller.style.scrollSnapType = "none"; // follow the cursor freely
        scroller.style.cursor = "grabbing";
      }
      scroller.scrollLeft = drag.left - dx;
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (drag?.moved) {
        suppressClick.current = true; // the click that ends a drag is not a selection
        scroller.style.scrollSnapType = "";
        scroller.style.cursor = "";
        scrollToIndex(scroller, nearestIndex(scroller), "smooth");
      }
      drag = null;
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("pointerdown", onPointerDown);
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      clearTimeout(settleTimer.current);
    };
  }, []);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setLive(nearestIndex(scroller));
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      wheelTarget.current = null;
      setLive(null);
      const { options: current, selectedIndex: selected, onChange: commit } = latest.current;
      const index = nearestIndex(scroller);
      if (index !== selected && current[index]) commit(current[index].value);
    }, SETTLE_MS);
  };

  const select = (index: number) => {
    const option = options[index];
    if (option && index !== selectedIndex) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = selectedIndex < 0 ? 0 : selectedIndex;
    const next = {
      ArrowLeft: from - 1,
      ArrowRight: from + 1,
      Home: 0,
      End: options.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = clamp(next, 0, options.length - 1);
    select(index);
    scrollerRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <div className="relative h-9 rounded-md border border-line bg-canvas">
      {/* Center marker, like the pointer on a dial. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-10 size-0 -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-accent"
      />
      <div
        ref={scrollerRef}
        role="radiogroup"
        aria-label={label}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="number-wheel relative flex h-full cursor-grab snap-x snap-mandatory items-center gap-1 overflow-x-auto overscroll-x-contain"
      >
        {options.map((option, index) => {
          const active = index === highlighted;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              data-index={index}
              aria-checked={index === selectedIndex}
              tabIndex={index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1}
              title={option.title}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                select(index);
              }}
              className={`h-7 min-w-7 shrink-0 snap-center rounded px-1.5 text-sm tabular-nums transition-[color,background-color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
                active
                  ? "scale-110 bg-raised font-semibold text-ink shadow-sm shadow-black/30"
                  : "text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function itemCenter(scroller: HTMLElement, index: number): number | null {
  const item = scroller.querySelector<HTMLElement>(`[data-index="${index}"]`);
  return item ? item.offsetLeft + item.offsetWidth / 2 : null;
}

function scrollToIndex(scroller: HTMLElement, index: number, behavior: ScrollBehavior) {
  const center = itemCenter(scroller, index);
  if (center === null) return;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({
    left: center - scroller.clientWidth / 2,
    behavior: reduceMotion ? "instant" : behavior,
  });
}

/** Item whose center is closest to the marker. */
function nearestIndex(scroller: HTMLElement): number {
  const marker = scroller.scrollLeft + scroller.clientWidth / 2;
  let best = 0;
  let bestDistance = Infinity;
  scroller.querySelectorAll<HTMLElement>("[data-index]").forEach((item, index) => {
    const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - marker);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

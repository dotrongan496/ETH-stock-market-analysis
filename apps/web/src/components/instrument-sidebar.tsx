"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import ChangeBadge from "@/components/change-badge";
import ThemeSwitch from "@/components/theme-switch";
import type { AssetClass, Instrument } from "@/lib/api";
import { formatCompactVnd, formatVnd } from "@/lib/format";
import { baseSymbol, subtitle } from "@/lib/instrument";
import {
  SORT_OPTIONS,
  favorites,
  instrumentId,
  searchInstruments,
  sortInstruments,
  sortOrder,
  toggleFavorite,
  type SortKey,
} from "@/lib/watchlist";

const TABS: ReadonlyArray<{ value: AssetClass; label: string }> = [
  { value: "stock", label: "Cổ phiếu VN" },
  { value: "crypto", label: "Crypto" },
];

const ROW_SELECTOR = "#instrument-list [data-row]";

interface InstrumentSidebarProps {
  instruments: Instrument[] | null;
  error: string | null;
  tab: AssetClass;
  onTabChange: (tab: AssetClass) => void;
  selected: string | null;
  onSelect: (symbol: string) => void;
  onRetry: () => void;
}

export default function InstrumentSidebar({
  instruments,
  error,
  tab,
  onTabChange,
  selected,
  onSelect,
  onRetry,
}: InstrumentSidebarProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const starred = favorites.use();
  const sort = sortOrder.use();

  const searching = query.trim() !== "";
  // Search looks through both tabs; otherwise the current tab, starred instruments first.
  const pool = searching
    ? searchInstruments(instruments ?? [], query)
    : sortInstruments(instruments?.filter((item) => item.asset_class === tab) ?? [], sort);
  const isStarred = (item: Instrument) => starred.includes(instrumentId(item));
  const pinned = searching ? [] : pool.filter(isStarred);
  const rest = searching ? pool : pool.filter((item) => !isStarred(item));
  const showTurnover = sort === "turnover" && !searching;

  // "/" jumps to the search box, as on most sites.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (item: Instrument) => {
    onSelect(item.symbol);
    if (searching) {
      onTabChange(item.asset_class); // keep the chosen row visible once the search is cleared
      setQuery("");
    }
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (query) setQuery("");
      else event.currentTarget.blur();
    } else if (event.key === "Enter" && searching && pool[0]) {
      event.preventDefault();
      choose(pool[0]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      document.querySelector<HTMLElement>(ROW_SELECTOR)?.focus();
    }
  };

  // ↑/↓ between rows; ↑ on the first row goes back to the search box.
  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR));
    const next = rows[rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
    else if (event.key === "ArrowUp") searchRef.current?.focus();
  };

  const renderRow = (item: Instrument) => (
    <InstrumentRow
      key={instrumentId(item)}
      item={item}
      active={item.symbol === selected}
      starred={isStarred(item)}
      showTurnover={showTurnover}
      onSelect={() => choose(item)}
      onKeyDown={onRowKey}
    />
  );

  return (
    <aside className="flex max-h-[45dvh] w-full flex-col border-b border-line bg-panel md:h-full md:max-h-none md:w-80 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold">ETH Market</div>
          <div className="text-xs text-muted">Giá quy đổi sang VND</div>
        </div>
        <div className="ml-auto">
          <ThemeSwitch />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Nhóm tài sản"
        className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1"
      >
        {TABS.map(({ value, label }) => {
          const active = value === tab && !searching;
          const count = instruments?.filter((item) => item.asset_class === value).length;
          return (
            <button
              key={value}
              id={`tab-${value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="instrument-list"
              onClick={() => {
                setQuery("");
                onTabChange(value);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                active ? "bg-raised text-ink shadow-sm shadow-black/40" : "text-muted hover:text-ink"
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="text-xs font-normal text-muted tabular-nums">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mx-3 mb-2 flex gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-canvas px-2 transition-colors focus-within:border-accent">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Tìm mã…"
            title="Tìm theo mã, cặp crypto hoặc tên công ty (phím /)"
            aria-label="Tìm mã"
            aria-controls="instrument-list"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Xóa tìm kiếm"
              className="grid size-5 shrink-0 place-items-center rounded text-base leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          ) : (
            <kbd
              title="Nhấn / để tìm"
              className="hidden rounded border border-line px-1 font-sans text-[10px] leading-4 text-muted md:inline"
            >
              /
            </kbd>
          )}
        </label>
        <select
          value={sort}
          onChange={(event) => sortOrder.set(event.target.value as SortKey)}
          aria-label="Sắp xếp danh sách"
          title={
            searching
              ? "Kết quả tìm kiếm xếp theo độ khớp"
              : "Sắp xếp danh sách (GTGD = giá trị giao dịch phiên gần nhất)"
          }
          disabled={searching}
          className="h-8 w-[6.5rem] shrink-0 cursor-pointer rounded-md border border-line bg-canvas px-1.5 text-xs text-ink outline-none transition-colors focus:border-accent disabled:cursor-default disabled:opacity-50"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-between px-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>{searching ? `Kết quả · ${pool.length}` : "Mã"}</span>
        <span>{showTurnover ? "Giá · GTGD phiên" : "Giá (VND) · Thay đổi"}</span>
      </div>

      <div
        id="instrument-list"
        role="tabpanel"
        aria-labelledby={searching ? undefined : `tab-${tab}`}
        aria-label={searching ? "Kết quả tìm kiếm" : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {instruments === null ? (
          error ? (
            <div className="m-2 rounded-md border border-down/30 bg-down/10 p-3 text-sm">
              <p className="text-ink">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-sm font-medium text-accent hover:underline"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <ListSkeleton />
          )
        ) : pool.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">
            {searching ? `Không tìm thấy “${query.trim()}”.` : "Chưa có mã nào."}
          </p>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <GroupLabel>Đang theo dõi</GroupLabel>
                <ul className="space-y-0.5">{pinned.map(renderRow)}</ul>
                {rest.length > 0 && <GroupLabel>Tất cả</GroupLabel>}
              </>
            )}
            <ul className="space-y-0.5">{rest.map(renderRow)}</ul>
          </>
        )}
      </div>

      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
        Dữ liệu chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </aside>
  );
}

function InstrumentRow({
  item,
  active,
  starred,
  showTurnover,
  onSelect,
  onKeyDown,
}: {
  item: Instrument;
  active: boolean;
  starred: boolean;
  showTurnover: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const name = baseSymbol(item);
  return (
    <li className="group relative">
      <button
        type="button"
        data-row
        onClick={onSelect}
        onKeyDown={onKeyDown}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center justify-between gap-3 rounded-md py-2 pl-8 pr-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
          active ? "bg-raised ring-1 ring-accent/40" : "hover:bg-raised/60"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted">
            {showTurnover ? `GTGD ${formatCompactVnd(item.turnover_vnd)}` : subtitle(item)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm tabular-nums">{formatVnd(item.last_close_vnd)}</span>
          <ChangeBadge value={item.change_pct} />
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggleFavorite(item)}
        aria-pressed={starred}
        aria-label={starred ? `Bỏ theo dõi ${name}` : `Theo dõi ${name}`}
        title={starred ? "Bỏ theo dõi" : "Theo dõi (ghim lên đầu danh sách)"}
        className={`absolute left-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
          starred ? "text-flat" : "text-muted/40 hover:text-muted group-hover:text-muted/80"
        }`}
      >
        <StarIcon filled={starred} />
      </button>
    </li>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted first:pt-0.5">
      {children}
    </p>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
      <path
        d="M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-muted" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-0.5" aria-label="Đang tải danh sách mã">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center justify-between px-2.5 py-2.5">
          <span className="space-y-1.5">
            <span className="block h-3.5 w-12 animate-pulse rounded bg-raised" />
            <span className="block h-2.5 w-24 animate-pulse rounded bg-raised" />
          </span>
          <span className="flex flex-col items-end gap-1.5">
            <span className="block h-3.5 w-20 animate-pulse rounded bg-raised" />
            <span className="block h-3 w-12 animate-pulse rounded bg-raised" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#161b25" />
      <path d="M11 7v18" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="11" width="6" height="9" rx="1.5" fill="#22c55e" />
      <path d="M21 6v19" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <rect x="18" y="13" width="6" height="8" rx="1.5" fill="#ef4444" />
    </svg>
  );
}

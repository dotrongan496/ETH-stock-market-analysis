import ChangeBadge from "@/components/change-badge";
import type { AssetClass, Instrument } from "@/lib/api";
import { formatVnd } from "@/lib/format";
import { baseSymbol, subtitle } from "@/lib/instrument";

const TABS: ReadonlyArray<{ value: AssetClass; label: string }> = [
  { value: "stock", label: "Cổ phiếu VN" },
  { value: "crypto", label: "Crypto" },
];

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
  const visible = instruments?.filter((item) => item.asset_class === tab) ?? [];

  return (
    <aside className="flex max-h-[45dvh] w-full flex-col border-b border-line bg-panel md:h-full md:max-h-none md:w-80 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold">ETH Market</div>
          <div className="text-xs text-muted">Giá quy đổi sang VND</div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Nhóm tài sản"
        className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1"
      >
        {TABS.map(({ value, label }) => {
          const active = value === tab;
          const count = instruments?.filter((item) => item.asset_class === value).length;
          return (
            <button
              key={value}
              id={`tab-${value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="instrument-list"
              onClick={() => onTabChange(value)}
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

      <div className="flex justify-between px-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Mã</span>
        <span>Giá (VND) · Thay đổi</span>
      </div>

      <div
        id="instrument-list"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
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
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">Chưa có mã nào.</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((item) => {
              const active = item.symbol === selected;
              return (
                <li key={`${item.exchange}:${item.symbol}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.symbol)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      active ? "bg-raised ring-1 ring-accent/40" : "hover:bg-raised/60"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{baseSymbol(item)}</span>
                      <span className="block truncate text-xs text-muted">{subtitle(item)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm tabular-nums">{formatVnd(item.last_close_vnd)}</span>
                      <ChangeBadge value={item.change_pct} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
        Dữ liệu chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </aside>
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

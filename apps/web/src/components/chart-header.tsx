"use client";

import { useState, type ReactNode } from "react";

import ChangeBadge from "@/components/change-badge";
import type { RangeKey } from "@/components/price-chart";
import SegmentedControl, { type SegmentOption } from "@/components/segmented-control";
import type { Instrument, Interval } from "@/lib/api";
import { formatDay, formatNumber, formatVnd, quoteDecimals } from "@/lib/format";
import { displayName, exchangeLabel } from "@/lib/instrument";

const INTERVAL_OPTIONS: ReadonlyArray<SegmentOption<Interval>> = [
  { value: "1m", label: "Theo Tháng (1M)", title: "Mỗi nến là một tháng" },
  { value: "1d", label: "Theo Ngày (1D)", title: "Mỗi nến là một phiên giao dịch" },
];

const RANGE_OPTIONS: ReadonlyArray<SegmentOption<RangeKey>> = [
  { value: "3M", label: "3T", title: "3 tháng gần nhất" },
  { value: "6M", label: "6T", title: "6 tháng gần nhất" },
  { value: "1Y", label: "1N", title: "1 năm gần nhất" },
  { value: "ALL", label: "Tất cả", title: "Toàn bộ dữ liệu" },
];

interface ChartHeaderProps {
  instrument: Instrument | null;
  /** Rate the displayed instrument prices were converted with. */
  appliedRate: number;
  rateInput: string;
  rateValid: boolean;
  onRateInput: (digits: string) => void;
  interval: Interval;
  onIntervalChange: (value: Interval) => void;
  range: RangeKey;
  onRangeChange: (value: RangeKey) => void;
}

export default function ChartHeader({
  instrument,
  appliedRate,
  rateInput,
  rateValid,
  onRateInput,
  interval,
  onIntervalChange,
  range,
  onRangeChange,
}: ChartHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line px-4 py-4 sm:px-5">
      <InstrumentSummary instrument={instrument} appliedRate={appliedRate} />
      <div className="flex flex-wrap items-end gap-3">
        <RateInput value={rateInput} valid={rateValid} onChange={onRateInput} />
        <Field label="Khung nến">
          <SegmentedControl
            label="Khung nến"
            value={interval}
            options={INTERVAL_OPTIONS}
            onChange={onIntervalChange}
          />
        </Field>
        <Field label="Khoảng thời gian">
          <SegmentedControl
            label="Khoảng thời gian"
            value={range}
            options={RANGE_OPTIONS}
            onChange={onRangeChange}
          />
        </Field>
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

function InstrumentSummary({
  instrument,
  appliedRate,
}: {
  instrument: Instrument | null;
  appliedRate: number;
}) {
  if (!instrument) {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-5 w-40 animate-pulse rounded bg-raised" />
        <div className="h-8 w-56 animate-pulse rounded bg-raised" />
        <div className="h-3 w-48 animate-pulse rounded bg-raised" />
      </div>
    );
  }

  const isCrypto = instrument.asset_class === "crypto";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight">{displayName(instrument)}</h1>
        <span className="rounded border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-muted">
          {exchangeLabel(instrument.exchange)}
        </span>
        {!isCrypto && instrument.name && (
          <span className="truncate text-sm text-muted">{instrument.name}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">
          {formatVnd(instrument.last_close_vnd)}
        </span>
        <ChangeBadge value={instrument.change_pct} size="md" />
      </div>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {instrument.last_trade_date
          ? `Giá đóng cửa phiên ${formatDay(instrument.last_trade_date)}`
          : "Chưa có dữ liệu giá"}
        {isCrypto && instrument.last_close != null && (
          <>
            {" · "}
            {formatNumber(instrument.last_close, quoteDecimals(instrument.last_close))}{" "}
            {instrument.quote_currency} × {formatNumber(appliedRate, 0)} ₫
          </>
        )}
      </p>
    </div>
  );
}

function RateInput({
  value,
  valid,
  onChange,
}: {
  value: string;
  valid: boolean;
  onChange: (digits: string) => void;
}) {
  // Raw digits while typing, grouped ("25.400") once the field loses focus.
  const [focused, setFocused] = useState(false);
  const shown = focused || !value ? value : formatNumber(Number(value), 0);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
        Tỷ giá USDT → VND
      </span>
      <span
        className={`flex h-9 items-center rounded-md border bg-canvas px-2.5 transition-colors ${
          valid ? "border-line focus-within:border-accent" : "border-down"
        }`}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="25.400"
          value={shown}
          aria-invalid={!valid}
          title={valid ? "Áp dụng cho giá Crypto (USDT)" : "Nhập số nguyên dương, tối đa 1.000.000"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 7))}
          className="w-20 bg-transparent text-right text-sm font-medium tabular-nums outline-none placeholder:text-muted/60"
        />
        <span className="ml-1.5 text-sm text-muted">₫</span>
      </span>
    </label>
  );
}

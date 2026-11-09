"""Pure market-data logic: currency conversion to VND and monthly resampling.

Kept free of I/O so it can be unit-tested without a database.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass, replace
from decimal import Decimal

DEFAULT_USD_VND_RATE = Decimal("25400")

VND = "VND"
# Quote currencies pegged to the US dollar; converted with the USD -> VND rate.
USD_PEGGED = frozenset({"USDT", "USD"})


class UnsupportedCurrencyError(ValueError):
    """Raised when a quote currency has no known conversion to VND."""


@dataclass(frozen=True, slots=True)
class Bar:
    """One OHLCV bar.

    `time` is the session date for daily bars, or the first day of the month
    for monthly bars. Volume is a quantity (shares / coins), never converted.
    """

    time: dt.date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


def vnd_factor(quote_currency: str, usd_vnd_rate: Decimal) -> Decimal:
    """Multiplier that turns a price quoted in `quote_currency` into VND."""
    currency = quote_currency.upper()
    if currency == VND:
        return Decimal(1)
    if currency in USD_PEGGED:
        return usd_vnd_rate
    raise UnsupportedCurrencyError(f"cannot convert quote currency {quote_currency!r} to VND")


def convert_bars(bars: Iterable[Bar], factor: Decimal) -> list[Bar]:
    """Scale open/high/low/close by `factor`; volume stays unchanged."""
    if factor == 1:
        return list(bars)
    return [
        replace(
            bar,
            open=bar.open * factor,
            high=bar.high * factor,
            low=bar.low * factor,
            close=bar.close * factor,
        )
        for bar in bars
    ]


def resample_monthly(bars: Iterable[Bar]) -> list[Bar]:
    """Aggregate daily bars into calendar-month bars, oldest first.

    open = first session's open, high = highest high, low = lowest low,
    close = last session's close, volume = total volume. `time` is the
    first day of the month, so monthly candles are evenly spaced on a chart.
    """
    monthly: list[Bar] = []
    for bar in sorted(bars, key=lambda b: b.time):
        month_start = bar.time.replace(day=1)
        if monthly and monthly[-1].time == month_start:
            current = monthly[-1]
            monthly[-1] = replace(
                current,
                high=max(current.high, bar.high),
                low=min(current.low, bar.low),
                close=bar.close,
                volume=current.volume + bar.volume,
            )
        else:
            monthly.append(replace(bar, time=month_start))
    return monthly


def pct_change(latest: Decimal | None, previous: Decimal | None) -> Decimal | None:
    """Percent change from `previous` to `latest`; None if either is missing or previous is 0."""
    if latest is None or previous is None or previous == 0:
        return None
    return (latest - previous) / previous * 100

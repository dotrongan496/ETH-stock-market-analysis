"""Unit tests for VND conversion, monthly resampling and read-query building (no DB)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from eth_api.db.queries import (
    build_daily_bars_query,
    build_find_instruments_query,
    build_latest_closes_query,
    group_latest_closes,
)
from eth_api.market import (
    Bar,
    UnsupportedCurrencyError,
    convert_bars,
    pct_change,
    resample_monthly,
    vnd_factor,
)


def bar(day: str, o: str, h: str, low: str, c: str, v: str) -> Bar:
    return Bar(
        time=dt.date.fromisoformat(day),
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(low),
        close=Decimal(c),
        volume=Decimal(v),
    )


def sql(stmt: object) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))  # type: ignore[attr-defined]


# --- currency conversion -----------------------------------------------------


def test_vnd_factor_keeps_vnd_and_converts_usdt() -> None:
    rate = Decimal("25400")
    assert vnd_factor("VND", rate) == 1
    assert vnd_factor("USDT", rate) == rate
    assert vnd_factor("usdt", rate) == rate  # case-insensitive


def test_vnd_factor_rejects_unknown_currency() -> None:
    with pytest.raises(UnsupportedCurrencyError):
        vnd_factor("EUR", Decimal("25400"))


def test_convert_bars_scales_prices_but_not_volume() -> None:
    [converted] = convert_bars([bar("2026-01-02", "2", "3", "1", "2.5", "10")], Decimal("25400"))
    assert (converted.open, converted.high, converted.low, converted.close) == (
        Decimal("50800"),
        Decimal("76200"),
        Decimal("25400"),
        Decimal("63500.0"),
    )
    assert converted.volume == Decimal("10")
    assert converted.time == dt.date(2026, 1, 2)


def test_convert_bars_identity_for_factor_one() -> None:
    bars = [bar("2026-01-02", "85900", "86000", "85000", "85500", "1000")]
    assert convert_bars(bars, Decimal(1)) == bars


# --- monthly resampling ------------------------------------------------------


def test_resample_monthly_aggregates_ohlcv() -> None:
    daily = [
        # Deliberately unsorted: resampling must not depend on input order.
        bar("2026-01-30", "108", "112", "104", "110", "30"),
        bar("2026-01-02", "100", "105", "95", "102", "10"),
        bar("2026-01-15", "102", "120", "90", "108", "20"),
        bar("2026-02-02", "111", "115", "109", "114", "5"),
        bar("2026-02-27", "114", "118", "100", "101", "7"),
    ]

    jan, feb = resample_monthly(daily)

    assert jan == bar("2026-01-01", "100", "120", "90", "110", "60")
    assert feb == bar("2026-02-01", "111", "118", "100", "101", "12")


def test_resample_monthly_keeps_single_session_month_and_year_boundary() -> None:
    monthly = resample_monthly(
        [bar("2025-12-31", "5", "6", "4", "5.5", "1"), bar("2026-01-02", "6", "7", "5", "6.5", "2")]
    )
    assert [m.time for m in monthly] == [dt.date(2025, 12, 1), dt.date(2026, 1, 1)]
    assert monthly[0].close == Decimal("5.5")


def test_resample_monthly_empty() -> None:
    assert resample_monthly([]) == []


# --- % change ----------------------------------------------------------------


def test_pct_change() -> None:
    assert pct_change(Decimal("110"), Decimal("100")) == Decimal("10")
    assert pct_change(Decimal("95"), Decimal("100")) == Decimal("-5")
    assert pct_change(Decimal("100"), None) is None
    assert pct_change(None, Decimal("100")) is None
    assert pct_change(Decimal("100"), Decimal("0")) is None


# --- read queries ------------------------------------------------------------


def test_latest_closes_query_uses_lateral_limit() -> None:
    compiled = sql(build_latest_closes_query())
    assert "LEFT OUTER JOIN LATERAL" in compiled
    assert "ORDER BY daily_prices.trade_date DESC" in compiled
    assert "LIMIT" in compiled
    assert "instruments.is_active IS true" in compiled


def test_find_instruments_query_uppercases_symbol_and_filters_exchange() -> None:
    stmt = build_find_instruments_query("fpt", "hose")
    params = stmt.compile(dialect=postgresql.dialect()).params
    assert "FPT" in params.values()
    assert "HOSE" in params.values()


def test_daily_bars_query_is_oldest_first() -> None:
    compiled = sql(build_daily_bars_query(7))
    assert "ORDER BY daily_prices.trade_date" in compiled
    assert "DESC" not in compiled


def row(inst_id: int, symbol: str, trade_date: str | None, close: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        id=inst_id,
        symbol=symbol,
        exchange="HOSE",
        asset_class="stock",
        name=symbol,
        quote_currency="VND",
        trade_date=dt.date.fromisoformat(trade_date) if trade_date else None,
        close=Decimal(close) if close else None,
    )


def test_group_latest_closes() -> None:
    quotes = group_latest_closes(
        [
            row(1, "FPT", "2026-11-06", "50800"),  # older row first: must still pick the newest
            row(1, "FPT", "2026-11-09", "51000"),
            row(2, "VCB", "2026-11-09", "60000"),  # only one session
            row(3, "NEW", None, None),  # no bars yet (outer join)
        ]
    )

    fpt, vcb, new = quotes
    assert (fpt.instrument.symbol, fpt.last_trade_date) == ("FPT", dt.date(2026, 11, 9))
    assert (fpt.last_close, fpt.prev_close) == (Decimal("51000"), Decimal("50800"))
    assert (vcb.last_close, vcb.prev_close) == (Decimal("60000"), None)
    assert (new.last_trade_date, new.last_close, new.prev_close) == (None, None, None)

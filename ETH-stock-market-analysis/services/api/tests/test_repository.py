"""Unit tests for repository query generation and seed watchlist."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy.dialects import postgresql

from eth_api.db.models import AssetClass, Exchange
from eth_api.db.repository import (
    DailyBarIn,
    InstrumentIn,
    build_daily_price_upsert,
    build_instrument_upsert,
)
from eth_api.seed import default_watchlist


def test_default_watchlist_contains_20_instruments() -> None:
    watchlist = default_watchlist()
    assert len(watchlist) == 20
    stocks = [i for i in watchlist if i.asset_class == AssetClass.STOCK]
    crypto = [i for i in watchlist if i.asset_class == AssetClass.CRYPTO]
    assert len(stocks) == 10
    assert len(crypto) == 10

    # Ensure symbols are unique per exchange
    pairs = [(i.symbol, i.exchange) for i in watchlist]
    assert len(set(pairs)) == 20


def test_build_instrument_upsert_sql() -> None:
    inst = InstrumentIn(
        symbol="FPT",
        exchange=Exchange.HOSE,
        asset_class=AssetClass.STOCK,
        quote_currency="VND",
        name="FPT",
    )
    stmt = build_instrument_upsert([inst])
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "INSERT INTO instruments" in compiled
    assert "ON CONFLICT ON CONSTRAINT uq_instruments_symbol_exchange DO UPDATE" in compiled


def test_build_daily_price_upsert_sql() -> None:
    bar = DailyBarIn(
        instrument_id=1,
        trade_date=dt.date(2026, 1, 2),
        open=Decimal("100"),
        high=Decimal("105"),
        low=Decimal("95"),
        close=Decimal("102"),
        volume=Decimal("1000"),
        source="vnstock",
    )
    stmt = build_daily_price_upsert([bar])
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "INSERT INTO daily_prices" in compiled
    assert "ON CONFLICT (instrument_id, trade_date) DO UPDATE" in compiled


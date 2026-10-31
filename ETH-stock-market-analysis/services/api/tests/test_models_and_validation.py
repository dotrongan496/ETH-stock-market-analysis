"""Unit tests for models and Pydantic validation schemas."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from pydantic import ValidationError

from eth_api.db.models import AssetClass, Exchange
from eth_api.db.repository import DailyBarIn, InstrumentIn, _dedupe_bars


def test_instrument_in_valid() -> None:
    inst = InstrumentIn(
        symbol="FPT",
        exchange=Exchange.HOSE,
        asset_class=AssetClass.STOCK,
        quote_currency="VND",
        name="FPT Corp",
    )
    assert inst.symbol == "FPT"
    assert inst.exchange == Exchange.HOSE
    assert inst.is_active is True


def test_daily_bar_in_valid() -> None:
    bar = DailyBarIn(
        instrument_id=1,
        trade_date=dt.date(2026, 1, 2),
        open=Decimal("100.0"),
        high=Decimal("105.0"),
        low=Decimal("98.0"),
        close=Decimal("102.0"),
        volume=Decimal("500000"),
        source="test",
    )
    assert bar.open == Decimal("100.0")
    assert bar.high >= bar.low


def test_daily_bar_in_invalid_high_low() -> None:
    with pytest.raises(ValidationError, match="high must be >= low"):
        DailyBarIn(
            instrument_id=1,
            trade_date=dt.date(2026, 1, 2),
            open=Decimal("100.0"),
            high=Decimal("90.0"),
            low=Decimal("98.0"),
            close=Decimal("95.0"),
            volume=Decimal("100"),
            source="test",
        )


def test_daily_bar_in_out_of_bounds() -> None:
    with pytest.raises(ValidationError, match="open/close must lie within"):
        DailyBarIn(
            instrument_id=1,
            trade_date=dt.date(2026, 1, 2),
            open=Decimal("110.0"),  # > high
            high=Decimal("105.0"),
            low=Decimal("98.0"),
            close=Decimal("102.0"),
            volume=Decimal("100"),
            source="test",
        )


def test_dedupe_bars_preserves_latest() -> None:
    d1 = dt.date(2026, 1, 2)
    b1 = DailyBarIn(
        instrument_id=1,
        trade_date=d1,
        open=Decimal("10"),
        high=Decimal("12"),
        low=Decimal("9"),
        close=Decimal("11"),
        volume=Decimal("100"),
        source="provider_a",
    )
    b2 = DailyBarIn(
        instrument_id=1,
        trade_date=d1,
        open=Decimal("10"),
        high=Decimal("12"),
        low=Decimal("9"),
        close=Decimal("11.5"),
        volume=Decimal("150"),
        source="provider_b",
    )
    deduped = _dedupe_bars([b1, b2])
    assert len(deduped) == 1
    assert deduped[0].source == "provider_b"
    assert deduped[0].close == Decimal("11.5")


"""Unit tests for market data providers (Binance & VN Stock)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
import json
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from pipelines.providers.base import MarketBar
from pipelines.providers.binance import BinanceProvider
from pipelines.providers.vnstock import VNStockProvider


def test_market_bar_validation() -> None:
    bar = MarketBar(
        symbol="BTCUSDT",
        exchange="BINANCE",
        trade_date=dt.date(2026, 1, 1),
        open=Decimal("95000"),
        high=Decimal("98000"),
        low=Decimal("94000"),
        close=Decimal("97000"),
        volume=Decimal("1234.56"),
        source="binance",
    )
    assert bar.symbol == "BTCUSDT"
    assert bar.high >= bar.low


def test_market_bar_invalid_bounds() -> None:
    with pytest.raises(ValidationError):
        MarketBar(
            symbol="BTCUSDT",
            exchange="BINANCE",
            trade_date=dt.date(2026, 1, 1),
            open=Decimal("99000"),  # > high
            high=Decimal("98000"),
            low=Decimal("94000"),
            close=Decimal("97000"),
            volume=Decimal("10"),
            source="binance",
        )


def test_binance_provider_mock() -> None:
    provider = BinanceProvider()
    mock_payload = [
        [
            1767225600000,  # 2026-01-01
            "95000.00",
            "98000.00",
            "94000.00",
            "97000.00",
            "1500.50",
            1767311999999,
        ]
    ]

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        bars = provider.fetch_daily_bars(
            symbol="BTCUSDT",
            start_date=dt.date(2025, 12, 31),
            end_date=dt.date(2026, 1, 2),
        )

    assert len(bars) == 1
    assert bars[0].symbol == "BTCUSDT"
    assert bars[0].trade_date == dt.date(2026, 1, 1)
    assert bars[0].close == Decimal("97000.00")
    assert bars[0].source == "binance"


def test_vnstock_provider_mock() -> None:
    provider = VNStockProvider()
    mock_payload = {
        "data": [
            {
                "tradingDate": "2026-01-02",
                "open": 130.0,
                "high": 135.0,
                "low": 128.0,
                "close": 133.0,
                "volume": 2500000,
            }
        ]
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        bars = provider.fetch_daily_bars(
            symbol="FPT",
            start_date=dt.date(2026, 1, 1),
            end_date=dt.date(2026, 1, 5),
        )

    assert len(bars) == 1
    assert bars[0].symbol == "FPT"
    assert bars[0].exchange == "HOSE"
    assert bars[0].trade_date == dt.date(2026, 1, 2)
    # 133.0 * 1000 = 133000 VND
    assert bars[0].close == Decimal("133000")
    assert bars[0].source == "tcbs"


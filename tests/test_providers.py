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
    # VCI gap-chart format: parallel arrays, prices in full VND, t = UTC midnight epoch.
    mock_payload = [
        {
            "symbol": "FPT",
            "o": [130000, 131000],
            "h": [135000, 132500],
            "l": [128000, 129800],
            "c": [133000, 130500.5],
            "v": [2500000, 1800000],
            "t": ["1767312000", "1767571200"],  # 2026-01-02, 2026-01-05
        }
    ]

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_open:
        bars = provider.fetch_daily_bars(
            symbol="fpt",
            start_date=dt.date(2026, 1, 1),
            end_date=dt.date(2026, 1, 4),
        )

    sent = json.loads(mock_open.call_args.args[0].data)
    assert sent["symbols"] == ["FPT"]
    assert sent["timeFrame"] == "ONE_DAY"

    # 2026-01-05 is outside [start, end] and must be filtered out.
    assert len(bars) == 1
    assert bars[0].symbol == "FPT"
    assert bars[0].exchange == "HOSE"
    assert bars[0].trade_date == dt.date(2026, 1, 2)
    assert bars[0].close == Decimal("133000")
    assert bars[0].source == "vci"


def test_vnstock_provider_empty_payload() -> None:
    provider = VNStockProvider()
    mock_resp = MagicMock()
    mock_resp.read.return_value = b"[]"
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        bars = provider.fetch_daily_bars("ACV", dt.date(2026, 1, 1), dt.date(2026, 1, 5))

    assert bars == []
"""Binance public REST provider for daily crypto klines."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
import logging
from typing import Sequence
import urllib.request
import json

from pipelines.providers.base import BaseProvider, MarketBar

logger = logging.getLogger(__name__)

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
MAX_LIMIT = 1000  # Binance hard cap on klines per request


class BinanceProvider(BaseProvider):
    """Fetch spot OHLCV bars from Binance public REST API without authentication."""

    name = "binance"

    def __init__(self, timeout_sec: int = 15) -> None:
        self.timeout_sec = timeout_sec

    def fetch_daily_bars(
        self,
        symbol: str,
        start_date: dt.date,
        end_date: dt.date,
    ) -> Sequence[MarketBar]:
        """Fetch daily bars for crypto pair (e.g. BTCUSDT, ETHUSDT).

        Binance returns at most ``MAX_LIMIT`` klines per request, so longer ranges
        are fetched page by page, advancing ``startTime`` past the last kline.
        """
        start_ms = int(dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp() * 1000)
        end_ms = int(dt.datetime.combine(end_date, dt.time.max, tzinfo=dt.timezone.utc).timestamp() * 1000)

        payload: list[list] = []
        cursor_ms = start_ms
        while cursor_ms <= end_ms:
            url = (
                f"{BINANCE_KLINES_URL}?symbol={symbol.upper()}&interval=1d"
                f"&startTime={cursor_ms}&endTime={end_ms}&limit={MAX_LIMIT}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "ETH-Market-Analysis/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as response:
                    page = json.loads(response.read().decode("utf-8"))
            except Exception as exc:
                logger.error("Failed to fetch Binance klines for %s: %s", symbol, exc)
                raise

            payload.extend(page)
            if len(page) < MAX_LIMIT:
                break
            next_cursor = int(page[-1][0]) + 1
            if next_cursor <= cursor_ms:  # defensive: never loop on a stuck cursor
                break
            cursor_ms = next_cursor

        bars: list[MarketBar] = []
        for k in payload:
            # Binance kline format: [open_time, open, high, low, close, volume, close_time, ...]
            open_time_ms = int(k[0])
            bar_date = dt.datetime.fromtimestamp(open_time_ms / 1000, tz=dt.timezone.utc).date()
            if bar_date < start_date or bar_date > end_date:
                continue

            bars.append(
                MarketBar(
                    symbol=symbol.upper(),
                    exchange="BINANCE",
                    trade_date=bar_date,
                    open=Decimal(str(k[1])),
                    high=Decimal(str(k[2])),
                    low=Decimal(str(k[3])),
                    close=Decimal(str(k[4])),
                    volume=Decimal(str(k[5])),
                    source=self.name,
                )
            )

        logger.info("Fetched %d bars for %s from Binance", len(bars), symbol)
        return bars


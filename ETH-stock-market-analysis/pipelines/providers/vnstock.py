"""Vietnam stock data provider using TCBS public chart API."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
import json
import logging
from typing import Sequence
import urllib.request

from pipelines.providers.base import BaseProvider, MarketBar

logger = logging.getLogger(__name__)

TCBS_BARS_URL = "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term"


class VNStockProvider(BaseProvider):
    """Fetch daily stock bars for HOSE/HNX/UPCoM via public endpoints."""

    name = "tcbs"

    def __init__(self, exchange_map: dict[str, str] | None = None, timeout_sec: int = 15) -> None:
        self.timeout_sec = timeout_sec
        self.exchange_map = exchange_map or {
            "FPT": "HOSE",
            "VCB": "HOSE",
            "HPG": "HOSE",
            "VNM": "HOSE",
            "MWG": "HOSE",
            "TCB": "HOSE",
            "SSI": "HOSE",
            "SHS": "HNX",
            "PVS": "HNX",
            "ACV": "UPCOM",
        }

    def fetch_daily_bars(
        self,
        symbol: str,
        start_date: dt.date,
        end_date: dt.date,
    ) -> Sequence[MarketBar]:
        """Fetch daily bars for Vietnamese stock symbol."""
        clean_symbol = symbol.upper()
        exchange = self.exchange_map.get(clean_symbol, "HOSE")
        url = f"{TCBS_BARS_URL}?ticker={clean_symbol}&type=stock&resolution=D"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            logger.error("Failed to fetch VN stock bars for %s: %s", clean_symbol, exc)
            raise

        raw_data = payload.get("data", []) if isinstance(payload, dict) else []
        bars: list[MarketBar] = []

        for item in raw_data:
            # TCBS format: {"tradingDate": "2026-01-02", "open": 100, "high": 105, "low": 98, "close": 102, "volume": 500000}
            date_str = item.get("tradingDate")
            if not date_str:
                continue

            trade_date = dt.date.fromisoformat(date_str[:10])
            if trade_date < start_date or trade_date > end_date:
                continue

            # Price in TCBS is usually thousands of VND; convert to full VND (x 1,000)
            multiplier = Decimal("1000") if item.get("open", 0) < 1000 else Decimal("1")

            open_val = Decimal(str(item["open"])) * multiplier
            high_val = Decimal(str(item["high"])) * multiplier
            low_val = Decimal(str(item["low"])) * multiplier
            close_val = Decimal(str(item["close"])) * multiplier
            vol_val = Decimal(str(item.get("volume", 0)))

            # Adjust edge-case micro anomalies if high < max(open, close)
            high_val = max(high_val, open_val, close_val)
            low_val = min(low_val, open_val, close_val)

            bars.append(
                MarketBar(
                    symbol=clean_symbol,
                    exchange=exchange,
                    trade_date=trade_date,
                    open=open_val,
                    high=high_val,
                    low=low_val,
                    close=close_val,
                    volume=vol_val,
                    source=self.name,
                )
            )

        logger.info("Fetched %d bars for %s from TCBS", len(bars), clean_symbol)
        return bars


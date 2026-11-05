"""Vietnam stock data provider using the VCI (Vietcap) public chart API.

The former TCBS endpoint (apipubaws.tcbs.com.vn) now returns HTTP 403, so it
was replaced by VCI — the same source used by the community `vnstock` library.

Notes:
- VCI returns prices in full VND (not thousands).
- Historical prices returned by VCI are **adjusted** for corporate actions
  (dividends/splits), so older bars may have non-round values.
- The API returns an empty list if `to` is in the future, so `to` is capped
  at the current time.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
import json
import logging
import time
from typing import Any, Sequence
import urllib.request

from pipelines.providers.base import BaseProvider, MarketBar

logger = logging.getLogger(__name__)

VCI_OHLC_URL = "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Referer": "https://trading.vietcap.com.vn/",
    "Origin": "https://trading.vietcap.com.vn",
}

DEFAULT_EXCHANGE_MAP: dict[str, str] = {
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


class VNStockProvider(BaseProvider):
    """Fetch daily stock bars for HOSE/HNX/UPCoM via the VCI public endpoint."""

    name = "vci"

    def __init__(self, exchange_map: dict[str, str] | None = None, timeout_sec: int = 20) -> None:
        self.timeout_sec = timeout_sec
        self.exchange_map = exchange_map or dict(DEFAULT_EXCHANGE_MAP)

    @staticmethod
    def _to_timestamp(end_date: dt.date) -> int:
        """Exclusive upper bound (start of the day after end_date, UTC), capped at now."""
        next_day = dt.datetime.combine(end_date + dt.timedelta(days=1), dt.time(), tzinfo=dt.UTC)
        return min(int(next_day.timestamp()), int(time.time()))

    def _post(self, body: dict[str, Any]) -> Any:
        req = urllib.request.Request(
            VCI_OHLC_URL,
            data=json.dumps(body).encode("utf-8"),
            headers=_HEADERS,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_sec) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch_daily_bars(
        self,
        symbol: str,
        start_date: dt.date,
        end_date: dt.date,
    ) -> Sequence[MarketBar]:
        """Fetch daily bars for a Vietnamese stock symbol in [start_date, end_date]."""
        clean_symbol = symbol.upper()
        exchange = self.exchange_map.get(clean_symbol, "HOSE")
        # Calendar days >= trading days, so this always covers the requested range.
        count_back = max((end_date - start_date).days + 1, 1)

        body = {
            "timeFrame": "ONE_DAY",
            "symbols": [clean_symbol],
            "to": self._to_timestamp(end_date),
            "countBack": count_back,
        }

        try:
            payload = self._post(body)
        except Exception as exc:
            logger.error("Failed to fetch VN stock bars for %s: %s", clean_symbol, exc)
            raise

        series = next(
            (s for s in payload if isinstance(s, dict) and s.get("symbol") == clean_symbol),
            None,
        ) if isinstance(payload, list) else None
        if series is None:
            logger.info("Fetched 0 bars for %s from VCI", clean_symbol)
            return []

        bars: list[MarketBar] = []
        for ts, o, h, l, c, v in zip(
            series.get("t", []),
            series.get("o", []),
            series.get("h", []),
            series.get("l", []),
            series.get("c", []),
            series.get("v", []),
            strict=False,
        ):
            trade_date = dt.datetime.fromtimestamp(int(ts), tz=dt.UTC).date()
            if trade_date < start_date or trade_date > end_date:
                continue

            open_val = Decimal(str(o))
            close_val = Decimal(str(c))
            # Guard against minor rounding anomalies in adjusted prices.
            high_val = max(Decimal(str(h)), open_val, close_val)
            low_val = min(Decimal(str(l)), open_val, close_val)

            bars.append(
                MarketBar(
                    symbol=clean_symbol,
                    exchange=exchange,
                    trade_date=trade_date,
                    open=open_val,
                    high=high_val,
                    low=low_val,
                    close=close_val,
                    volume=Decimal(str(v)),
                    source=self.name,
                )
            )

        logger.info("Fetched %d bars for %s from VCI", len(bars), clean_symbol)
        return bars

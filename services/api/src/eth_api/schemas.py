"""Response models for the market-data endpoints.

Prices are serialized as JSON numbers (not strings) so charting libraries can
consume them directly. All prices are in VND after conversion.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

Interval = Literal["1d", "1m"]


class InstrumentOut(BaseModel):
    """An instrument with its latest close converted to VND."""

    symbol: str
    exchange: str
    asset_class: str
    name: str | None
    quote_currency: str
    last_trade_date: dt.date | None = Field(description="Latest session with data")
    last_close: float | None = Field(description="Latest close in the quote currency")
    last_close_vnd: float | None = Field(description="Latest close converted to VND")
    change_pct: float | None = Field(description="% change of the close vs the previous session")


class PriceBarOut(BaseModel):
    """One OHLCV candle; `time` is the session date (1d) or first day of the month (1m)."""

    time: dt.date
    open: float
    high: float
    low: float
    close: float
    volume: float


class PriceSeriesOut(BaseModel):
    """Candles of one instrument, in VND."""

    symbol: str
    exchange: str
    asset_class: str
    name: str | None
    quote_currency: str
    currency: Literal["VND"] = "VND"
    interval: Interval
    usd_vnd_rate: float | None = Field(
        description="USD->VND rate applied; null when the instrument is already quoted in VND"
    )
    bars: list[PriceBarOut]

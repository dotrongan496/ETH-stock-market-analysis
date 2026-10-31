"""Base abstraction for data providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
import datetime as dt
from decimal import Decimal
from typing import Sequence

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MarketBar(BaseModel):
    """Standardized OHLCV bar emitted by any provider."""

    model_config = ConfigDict(frozen=True)

    symbol: str = Field(min_length=1, max_length=32)
    exchange: str = Field(min_length=1, max_length=16)
    trade_date: dt.date
    open: Decimal = Field(gt=0)
    high: Decimal = Field(gt=0)
    low: Decimal = Field(gt=0)
    close: Decimal = Field(gt=0)
    volume: Decimal = Field(ge=0)
    source: str = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def _validate_bar(self) -> MarketBar:
        if self.high < self.low:
            raise ValueError(f"high ({self.high}) cannot be lower than low ({self.low})")
        if not (self.low <= self.open <= self.high and self.low <= self.close <= self.high):
            raise ValueError(f"open ({self.open}) or close ({self.close}) outside [low, high]")
        return self


class BaseProvider(ABC):
    """Abstract interface that all market data providers must implement."""

    name: str

    @abstractmethod
    def fetch_daily_bars(
        self,
        symbol: str,
        start_date: dt.date,
        end_date: dt.date,
    ) -> Sequence[MarketBar]:
        """Fetch daily OHLCV bars for a symbol in [start_date, end_date]."""
        pass


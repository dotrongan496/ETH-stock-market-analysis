"""Idempotent write operations (PostgreSQL upserts)."""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Iterable, Sequence
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.dialects.postgresql.dml import Insert
from sqlalchemy.orm import Session

from eth_api.db.models import AssetClass, DailyPrice, Exchange, Instrument

logger = logging.getLogger(__name__)

# 9 bound params per price row; stay well below PostgreSQL's 65535 limit.
BATCH_SIZE = 1000


class InstrumentIn(BaseModel):
    """Validated instrument payload."""

    model_config = ConfigDict(frozen=True)

    symbol: str = Field(min_length=1, max_length=32)
    exchange: Exchange
    asset_class: AssetClass
    quote_currency: str = Field(min_length=2, max_length=8)
    name: str | None = None
    is_active: bool = True


class DailyBarIn(BaseModel):
    """Validated daily OHLCV bar."""

    model_config = ConfigDict(frozen=True)

    instrument_id: int
    trade_date: dt.date
    open: Decimal = Field(gt=0)
    high: Decimal = Field(gt=0)
    low: Decimal = Field(gt=0)
    close: Decimal = Field(gt=0)
    volume: Decimal = Field(ge=0)
    source: str = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def _check_range(self) -> DailyBarIn:
        if self.high < self.low:
            raise ValueError("high must be >= low")
        if not (self.low <= self.open <= self.high and self.low <= self.close <= self.high):
            raise ValueError("open/close must lie within [low, high]")
        return self


def build_instrument_upsert(rows: Sequence[InstrumentIn]) -> Insert:
    """Build INSERT ... ON CONFLICT (symbol, exchange) DO UPDATE."""
    values = [r.model_dump(mode="json") for r in rows]
    stmt = insert(Instrument).values(values)
    return stmt.on_conflict_do_update(
        constraint="uq_instruments_symbol_exchange",
        set_={
            "asset_class": stmt.excluded.asset_class,
            "quote_currency": stmt.excluded.quote_currency,
            "name": stmt.excluded.name,
            "is_active": stmt.excluded.is_active,
            "updated_at": func.now(),
        },
    )


def build_daily_price_upsert(rows: Sequence[DailyBarIn]) -> Insert:
    """Build INSERT ... ON CONFLICT (instrument_id, trade_date) DO UPDATE."""
    values: list[dict[str, Any]] = [r.model_dump() for r in rows]
    stmt = insert(DailyPrice).values(values)
    return stmt.on_conflict_do_update(
        index_elements=[DailyPrice.instrument_id, DailyPrice.trade_date],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
            "source": stmt.excluded.source,
            "ingested_at": func.now(),
        },
    )


def _dedupe_bars(rows: Iterable[DailyBarIn]) -> list[DailyBarIn]:
    """Keep the last bar per (instrument_id, trade_date); ON CONFLICT rejects in-batch dupes."""
    latest: dict[tuple[int, dt.date], DailyBarIn] = {}
    for row in rows:
        latest[(row.instrument_id, row.trade_date)] = row
    return list(latest.values())


def upsert_instruments(session: Session, rows: Sequence[InstrumentIn]) -> dict[tuple[str, str], int]:
    """Upsert instruments and return a map (symbol, exchange) -> id. Caller commits."""
    if not rows:
        return {}
    unique = list({(r.symbol, r.exchange.value): r for r in rows}.values())
    session.execute(build_instrument_upsert(unique))
    keys = [(r.symbol, r.exchange.value) for r in unique]
    result = session.execute(
        select(Instrument.symbol, Instrument.exchange, Instrument.id).where(
            Instrument.symbol.in_([k[0] for k in keys])
        )
    )
    wanted = set(keys)
    ids = {(s, e): i for s, e, i in result if (s, e) in wanted}
    logger.info("Upserted %d instruments", len(ids))
    return ids


def upsert_daily_prices(session: Session, rows: Iterable[DailyBarIn]) -> int:
    """Upsert daily bars in batches; re-running with the same input is a no-op. Caller commits."""
    bars = _dedupe_bars(rows)
    for start in range(0, len(bars), BATCH_SIZE):
        session.execute(build_daily_price_upsert(bars[start : start + BATCH_SIZE]))
    logger.info("Upserted %d daily bars", len(bars))
    return len(bars)


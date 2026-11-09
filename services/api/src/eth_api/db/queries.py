"""Read-side queries for market data (instruments + daily bars)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, select, true
from sqlalchemy.orm import Session

from eth_api.db.models import DailyPrice, Instrument
from eth_api.market import Bar


@dataclass(frozen=True, slots=True)
class InstrumentInfo:
    """Instrument fields exposed by the API."""

    id: int
    symbol: str
    exchange: str
    asset_class: str
    name: str | None
    quote_currency: str


@dataclass(frozen=True, slots=True)
class InstrumentQuote:
    """An instrument with its two most recent closes (in its own quote currency)."""

    instrument: InstrumentInfo
    last_trade_date: dt.date | None
    last_close: Decimal | None
    prev_close: Decimal | None


_INSTRUMENT_COLUMNS = (
    Instrument.id,
    Instrument.symbol,
    Instrument.exchange,
    Instrument.asset_class,
    Instrument.name,
    Instrument.quote_currency,
)


def build_latest_closes_query(sessions: int = 2) -> Select[Any]:
    """Active instruments joined to their `sessions` most recent closes.

    The LATERAL subquery walks the (instrument_id, trade_date) primary key
    backwards, so cost grows with the number of instruments, not of bars.
    Instruments without any bar are kept (outer join, NULL date/close).
    """
    recent = (
        select(DailyPrice.trade_date, DailyPrice.close)
        .where(DailyPrice.instrument_id == Instrument.id)
        .order_by(DailyPrice.trade_date.desc())
        .limit(sessions)
        .lateral("recent")
    )
    return (
        select(*_INSTRUMENT_COLUMNS, recent.c.trade_date, recent.c.close)
        .select_from(Instrument)
        .outerjoin(recent, true())
        .where(Instrument.is_active.is_(True))
        .order_by(Instrument.asset_class.desc(), Instrument.symbol, recent.c.trade_date.desc())
    )


def build_find_instruments_query(symbol: str, exchange: str | None = None) -> Select[Any]:
    """Active instruments matching `symbol` (and `exchange` when given), case-insensitive."""
    stmt = select(*_INSTRUMENT_COLUMNS).where(
        Instrument.symbol == symbol.upper(), Instrument.is_active.is_(True)
    )
    if exchange:
        stmt = stmt.where(Instrument.exchange == exchange.upper())
    return stmt.order_by(Instrument.exchange)


def build_daily_bars_query(instrument_id: int) -> Select[Any]:
    """All daily bars of one instrument, oldest first."""
    return (
        select(
            DailyPrice.trade_date,
            DailyPrice.open,
            DailyPrice.high,
            DailyPrice.low,
            DailyPrice.close,
            DailyPrice.volume,
        )
        .where(DailyPrice.instrument_id == instrument_id)
        .order_by(DailyPrice.trade_date)
    )


def _instrument_from_row(row: Any) -> InstrumentInfo:
    return InstrumentInfo(
        id=row.id,
        symbol=row.symbol,
        exchange=row.exchange,
        asset_class=row.asset_class,
        name=row.name,
        quote_currency=row.quote_currency,
    )


def group_latest_closes(rows: Iterable[Any]) -> list[InstrumentQuote]:
    """Fold rows of (instrument columns..., trade_date, close) into one quote per instrument.

    Instrument order follows the rows; closes are re-sorted newest first, so the
    result does not depend on the database returning them in any order.
    """
    instruments: dict[int, InstrumentInfo] = {}
    closes: dict[int, list[tuple[dt.date, Decimal]]] = {}
    for row in rows:
        if row.id not in instruments:
            instruments[row.id] = _instrument_from_row(row)
            closes[row.id] = []
        if row.trade_date is not None and row.close is not None:
            closes[row.id].append((row.trade_date, row.close))

    quotes: list[InstrumentQuote] = []
    for inst_id, info in instruments.items():
        recent = sorted(closes[inst_id], key=lambda item: item[0], reverse=True)
        quotes.append(
            InstrumentQuote(
                instrument=info,
                last_trade_date=recent[0][0] if recent else None,
                last_close=recent[0][1] if recent else None,
                prev_close=recent[1][1] if len(recent) > 1 else None,
            )
        )
    return quotes


class MarketRepository:
    """Read access to instruments and daily bars for the API layer."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_quotes(self) -> list[InstrumentQuote]:
        """Every active instrument with its latest and previous close."""
        return group_latest_closes(self._session.execute(build_latest_closes_query()))

    def find_instruments(self, symbol: str, exchange: str | None = None) -> list[InstrumentInfo]:
        """Instruments matching a symbol; more than one means it is listed on several venues."""
        rows = self._session.execute(build_find_instruments_query(symbol, exchange))
        return [_instrument_from_row(row) for row in rows]

    def daily_bars(self, instrument_id: int) -> Sequence[Bar]:
        """Daily bars of one instrument in its quote currency, oldest first."""
        rows = self._session.execute(build_daily_bars_query(instrument_id))
        return [
            Bar(
                time=row.trade_date,
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
            )
            for row in rows
        ]

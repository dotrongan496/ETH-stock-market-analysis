"""ORM models: instruments (stocks + crypto) and daily OHLCV bars."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from eth_api.db.base import Base


class AssetClass(StrEnum):
    """Supported asset classes."""

    STOCK = "stock"
    CRYPTO = "crypto"


class Exchange(StrEnum):
    """Supported venues."""

    HOSE = "HOSE"
    HNX = "HNX"
    UPCOM = "UPCOM"
    BINANCE = "BINANCE"


PRICE = Numeric(24, 8)
VOLUME = Numeric(30, 8)


class Instrument(Base):
    """A tradable instrument, unique by (symbol, exchange)."""

    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("symbol", "exchange", name="uq_instruments_symbol_exchange"),
        CheckConstraint(
            "asset_class IN ('stock', 'crypto')", name="asset_class_valid"
        ),
        CheckConstraint(
            "exchange IN ('HOSE', 'HNX', 'UPCOM', 'BINANCE')", name="exchange_valid"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False)
    asset_class: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    quote_currency: Mapped[str] = mapped_column(String(8), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DailyPrice(Base):
    """Raw (unadjusted) daily OHLCV bar. TimescaleDB hypertable on `trade_date`.

    Prices are stored in full quote-currency units (e.g. VND, not thousands of VND).
    """

    __tablename__ = "daily_prices"
    __table_args__ = (
        CheckConstraint("high >= low", name="high_gte_low"),
        CheckConstraint("open > 0 AND high > 0 AND low > 0 AND close > 0", name="prices_positive"),
        CheckConstraint("volume >= 0", name="volume_non_negative"),
    )

    instrument_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    trade_date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    open: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    high: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    low: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    close: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    volume: Mapped[Decimal] = mapped_column(VOLUME, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    ingested_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


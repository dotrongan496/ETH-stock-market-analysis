"""Read-only market-data endpoints: instrument list and VND-converted candles."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from eth_api.db.queries import MarketRepository
from eth_api.db.session import get_session
from eth_api.market import (
    DEFAULT_USD_VND_RATE,
    VND,
    UnsupportedCurrencyError,
    convert_bars,
    pct_change,
    resample_monthly,
    vnd_factor,
)
from eth_api.schemas import InstrumentOut, Interval, PriceBarOut, PriceSeriesOut

router = APIRouter(prefix="/api", tags=["market"])

UsdVndRate = Annotated[
    Decimal,
    Query(gt=0, le=1_000_000, description="Rate used to convert 1 USDT into VND"),
]
Symbol = Annotated[
    str,
    Path(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$", examples=["FPT", "BTCUSDT"]),
]


def get_market_repository(session: Annotated[Session, Depends(get_session)]) -> MarketRepository:
    """FastAPI dependency; tests override it with an in-memory fake."""
    return MarketRepository(session)


Repository = Annotated[MarketRepository, Depends(get_market_repository)]


@router.get("/instruments", response_model=list[InstrumentOut])
def list_instruments(
    repo: Repository, usd_vnd_rate: UsdVndRate = DEFAULT_USD_VND_RATE
) -> list[InstrumentOut]:
    """All tracked instruments with the latest close in VND and % change vs the previous session."""
    items: list[InstrumentOut] = []
    for quote in repo.list_quotes():
        inst = quote.instrument
        try:
            factor: Decimal | None = vnd_factor(inst.quote_currency, usd_vnd_rate)
        except UnsupportedCurrencyError:
            factor = None
        last_close_vnd = (
            quote.last_close * factor
            if quote.last_close is not None and factor is not None
            else None
        )
        change = pct_change(quote.last_close, quote.prev_close)
        items.append(
            InstrumentOut(
                symbol=inst.symbol,
                exchange=inst.exchange,
                asset_class=inst.asset_class,
                name=inst.name,
                quote_currency=inst.quote_currency,
                last_trade_date=quote.last_trade_date,
                last_close=float(quote.last_close) if quote.last_close is not None else None,
                last_close_vnd=float(last_close_vnd) if last_close_vnd is not None else None,
                change_pct=round(float(change), 4) if change is not None else None,
            )
        )
    return items


@router.get(
    "/prices/{symbol}",
    response_model=PriceSeriesOut,
    responses={
        404: {"description": "Unknown symbol"},
        409: {"description": "Symbol listed on several exchanges; pass ?exchange="},
    },
)
def get_prices(
    symbol: Symbol,
    repo: Repository,
    interval: Interval = "1d",
    usd_vnd_rate: UsdVndRate = DEFAULT_USD_VND_RATE,
    exchange: Annotated[str | None, Query(max_length=16)] = None,
) -> PriceSeriesOut:
    """OHLCV candles in VND: daily (`1d`) or aggregated per calendar month (`1m`).

    USDT-quoted prices are multiplied by `usd_vnd_rate`; VND prices are returned as-is.
    Volume is a quantity and is never converted.
    """
    matches = repo.find_instruments(symbol, exchange)
    if not matches:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"instrument '{symbol.upper()}' not found")
    if len(matches) > 1:
        venues = ", ".join(m.exchange for m in matches)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"symbol '{symbol.upper()}' is listed on several exchanges ({venues}); "
            "pass ?exchange= to choose one",
        )
    inst = matches[0]

    try:
        factor = vnd_factor(inst.quote_currency, usd_vnd_rate)
    except UnsupportedCurrencyError as exc:
        raise HTTPException(422, str(exc)) from exc

    bars = convert_bars(repo.daily_bars(inst.id), factor)
    if interval == "1m":
        bars = resample_monthly(bars)

    return PriceSeriesOut(
        symbol=inst.symbol,
        exchange=inst.exchange,
        asset_class=inst.asset_class,
        name=inst.name,
        quote_currency=inst.quote_currency,
        interval=interval,
        usd_vnd_rate=None if inst.quote_currency.upper() == VND else float(usd_vnd_rate),
        bars=[
            PriceBarOut(
                time=bar.time,
                open=float(bar.open),
                high=float(bar.high),
                low=float(bar.low),
                close=float(bar.close),
                volume=float(bar.volume),
            )
            for bar in bars
        ],
    )

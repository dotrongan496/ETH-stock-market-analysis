"""Seed the initial watchlist (10 VN stocks + 10 crypto). Idempotent.

Usage: uv run --package eth-api eth-api-seed
"""

from __future__ import annotations

import logging
import sys

from sqlalchemy.exc import SQLAlchemyError

from eth_api.config import get_settings
from eth_api.db.models import AssetClass, Exchange
from eth_api.db.repository import InstrumentIn, upsert_instruments
from eth_api.db.session import get_sessionmaker
from eth_api.logging_config import configure_logging

logger = logging.getLogger(__name__)

_STOCKS: list[tuple[str, Exchange, str]] = [
    ("FPT", Exchange.HOSE, "FPT Corporation"),
    ("VCB", Exchange.HOSE, "Vietcombank"),
    ("HPG", Exchange.HOSE, "Hoa Phat Group"),
    ("VNM", Exchange.HOSE, "Vinamilk"),
    ("MWG", Exchange.HOSE, "Mobile World"),
    ("TCB", Exchange.HOSE, "Techcombank"),
    ("SSI", Exchange.HOSE, "SSI Securities"),
    ("SHS", Exchange.HNX, "Saigon - Hanoi Securities"),
    ("PVS", Exchange.HNX, "PetroVietnam Technical Services"),
    ("ACV", Exchange.UPCOM, "Airports Corporation of Vietnam"),
]

_CRYPTO_BASES: list[str] = ["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "TRX", "AVAX", "LINK"]


def default_watchlist() -> list[InstrumentIn]:
    """Return the default 20-instrument watchlist."""
    stocks = [
        InstrumentIn(
            symbol=s, exchange=ex, asset_class=AssetClass.STOCK, quote_currency="VND", name=n
        )
        for s, ex, n in _STOCKS
    ]
    crypto = [
        InstrumentIn(
            symbol=f"{b}USDT",
            exchange=Exchange.BINANCE,
            asset_class=AssetClass.CRYPTO,
            quote_currency="USDT",
            name=b,
        )
        for b in _CRYPTO_BASES
    ]
    return stocks + crypto


def main() -> int:
    """CLI entry point. Returns process exit code."""
    configure_logging(get_settings().log_level)
    try:
        with get_sessionmaker().begin() as session:
            ids = upsert_instruments(session, default_watchlist())
    except SQLAlchemyError:
        logger.exception("Seeding instruments failed")
        return 1
    logger.info("Seed complete: %d instruments", len(ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())


"""CLI script to sync market data for the default 20 instruments.

Usage:
  uv run python -m pipelines.providers.sync --days 30
  uv run python -m pipelines.providers.sync --days 7 --dry-run
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys

from eth_api.config import get_settings
from eth_api.db.models import Instrument
from eth_api.db.repository import DailyBarIn, upsert_daily_prices
from eth_api.db.session import get_sessionmaker
from eth_api.logging_config import configure_logging
from eth_api.seed import _CRYPTO_BASES, _STOCKS
from pipelines.providers.base import MarketBar
from pipelines.providers.binance import BinanceProvider
from pipelines.providers.vnstock import VNStockProvider

logger = logging.getLogger(__name__)


def fetch_all_watchlist(
    days: int = 30,
) -> list[MarketBar]:
    """Fetch daily bars for 10 VN stocks and 10 Crypto symbols."""
    end_date = dt.date.today()
    start_date = end_date - dt.timedelta(days=days)

    binance_provider = BinanceProvider()
    vn_provider = VNStockProvider()

    all_bars: list[MarketBar] = []

    # 1. Fetch 10 Crypto
    for base in _CRYPTO_BASES:
        pair = f"{base}USDT"
        try:
            bars = binance_provider.fetch_daily_bars(pair, start_date=start_date, end_date=end_date)
            all_bars.extend(bars)
        except Exception as exc:
            logger.warning("Failed crypto sync for %s: %s", pair, exc)

    # 2. Fetch 10 VN stocks
    for symbol, _, _ in _STOCKS:
        try:
            bars = vn_provider.fetch_daily_bars(symbol, start_date=start_date, end_date=end_date)
            all_bars.extend(bars)
        except Exception as exc:
            logger.warning("Failed stock sync for %s: %s", symbol, exc)

    return all_bars


def save_bars_to_db(bars: list[MarketBar]) -> int:
    """Upsert fetched bars into database matching instruments table."""
    if not bars:
        return 0

    sessionmaker = get_sessionmaker()
    with sessionmaker.begin() as session:
        # Load instrument mapping (symbol, exchange) -> id
        instruments = session.query(Instrument.id, Instrument.symbol, Instrument.exchange).all()
        id_map = {(row.symbol, row.exchange): row.id for row in instruments}

        daily_rows: list[DailyBarIn] = []
        skipped = 0
        for bar in bars:
            inst_id = id_map.get((bar.symbol, bar.exchange))
            if inst_id is None:
                skipped += 1
                continue
            daily_rows.append(
                DailyBarIn(
                    instrument_id=inst_id,
                    trade_date=bar.trade_date,
                    open=bar.open,
                    high=bar.high,
                    low=bar.low,
                    close=bar.close,
                    volume=bar.volume,
                    source=bar.source,
                )
            )

        if skipped > 0:
            logger.warning("Skipped %d bars because instrument was not seeded in DB", skipped)

        count = upsert_daily_prices(session, daily_rows)
        return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync market data for VN stocks and Crypto.")
    parser.add_argument("--days", type=int, default=30, help="Number of past days to fetch (default: 30)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and summarize without writing to DB")
    parser.add_argument("--output", type=str, default=None, help="Optional JSON path to save raw bars")

    args = parser.parse_args()
    configure_logging(get_settings().log_level)

    logger.info("Starting market data sync (past %d days)...", args.days)
    bars = fetch_all_watchlist(days=args.days)
    logger.info("Total fetched bars: %d", len(bars))

    if args.output:
        data = [b.model_dump(mode="json") for b in bars]
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        logger.info("Saved %d bars to %s", len(bars), args.output)

    if args.dry_run:
        logger.info("Dry run requested; DB write skipped.")
        return 0

    try:
        saved = save_bars_to_db(bars)
        logger.info("Successfully upserted %d daily price bars into database.", saved)
    except Exception as exc:
        logger.error("Database save failed: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())


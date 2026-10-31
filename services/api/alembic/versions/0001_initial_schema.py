
"""Initial schema: instruments + daily_prices (hypertable if timescaledb available).

Revision ID: 0001
Revises:
Create Date: 2026-10-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:

    bind = op.get_bind()
    has_timescale = bool(
        bind.execute(
            sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")
        ).scalar()
    )

    if has_timescale:
        op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    op.create_table(
        "instruments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("exchange", sa.String(16), nullable=False),
        sa.Column("asset_class", sa.String(16), nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("quote_currency", sa.String(8), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_instruments"),
        sa.UniqueConstraint("symbol", "exchange", name="uq_instruments_symbol_exchange"),
        sa.CheckConstraint(
            "asset_class IN ('stock', 'crypto')", name="ck_instruments_asset_class_valid"
        ),
        sa.CheckConstraint(
            "exchange IN ('HOSE', 'HNX', 'UPCOM', 'BINANCE')", name="ck_instruments_exchange_valid"
        ),
    )

    op.create_table(
        "daily_prices",
        sa.Column("instrument_id", sa.BigInteger(), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("open", sa.Numeric(24, 8), nullable=False),
        sa.Column("high", sa.Numeric(24, 8), nullable=False),
        sa.Column("low", sa.Numeric(24, 8), nullable=False),
        sa.Column("close", sa.Numeric(24, 8), nullable=False),
        sa.Column("volume", sa.Numeric(30, 8), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column(
            "ingested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("instrument_id", "trade_date", name="pk_daily_prices"),
        sa.ForeignKeyConstraint(
            ["instrument_id"],
            ["instruments.id"],
            name="fk_daily_prices_instrument_id_instruments",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("high >= low", name="ck_daily_prices_high_gte_low"),
        sa.CheckConstraint(
            "open > 0 AND high > 0 AND low > 0 AND close > 0",
            name="ck_daily_prices_prices_positive",
        ),
        sa.CheckConstraint("volume >= 0", name="ck_daily_prices_volume_non_negative"),
    )

    if has_timescale:
        op.execute(
            "SELECT create_hypertable('daily_prices', by_range('trade_date', INTERVAL '1 year'), "
            "if_not_exists => TRUE)"
        )


def downgrade() -> None:
    op.drop_table("daily_prices")
    op.drop_table("instruments")


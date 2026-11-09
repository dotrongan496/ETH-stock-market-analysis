"""Endpoint tests for /api/instruments and /api/prices/{symbol}, plus CORS (no DB).

The repository dependency is replaced by an in-memory fake, so these tests
exercise routing, validation, VND conversion and resampling end to end.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterator
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from eth_api.db.queries import InstrumentInfo, InstrumentQuote, group_latest_closes
from eth_api.main import create_app
from eth_api.market import Bar
from eth_api.routers.market import get_market_repository


def bar(day: str, o: str, h: str, low: str, c: str, v: str) -> Bar:
    return Bar(
        time=dt.date.fromisoformat(day),
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(low),
        close=Decimal(c),
        volume=Decimal(v),
    )


FPT = InstrumentInfo(1, "FPT", "HOSE", "stock", "FPT Corporation", "VND")
BTC = InstrumentInfo(2, "BTCUSDT", "BINANCE", "crypto", "BTC", "USDT")
NEW = InstrumentInfo(3, "NEW", "HNX", "stock", None, "VND")  # listed, no bars yet

BARS: dict[int, list[Bar]] = {
    FPT.id: [
        bar("2026-10-30", "84000", "86000", "83500", "85000", "1000"),
        bar("2026-11-02", "85000", "86500", "84800", "86000", "1500"),
        bar("2026-11-03", "86000", "87000", "85500", "85900", "2000"),
    ],
    BTC.id: [
        bar("2026-10-31", "100", "110", "90", "105", "2.5"),
        bar("2026-11-01", "105", "120", "100", "110", "3"),
        bar("2026-11-02", "110", "115", "95", "99", "4.5"),
    ],
}


class FakeMarketRepository:
    """In-memory stand-in for MarketRepository."""

    def __init__(
        self, instruments: list[InstrumentInfo], bars: dict[int, list[Bar]]
    ) -> None:
        self.instruments = instruments
        self.bars = bars

    def list_quotes(self) -> list[InstrumentQuote]:
        # Build the same rows the LATERAL query returns, then reuse the real folding logic.
        rows: list[Any] = []
        for inst in self.instruments:
            recent = sorted(self.bars.get(inst.id, []), key=lambda b: b.time, reverse=True)[:2]
            for b in recent or [None]:
                rows.append(
                    SimpleNamespace(
                        id=inst.id,
                        symbol=inst.symbol,
                        exchange=inst.exchange,
                        asset_class=inst.asset_class,
                        name=inst.name,
                        quote_currency=inst.quote_currency,
                        trade_date=b.time if b else None,
                        close=b.close if b else None,
                    )
                )
        return group_latest_closes(rows)

    def find_instruments(self, symbol: str, exchange: str | None = None) -> list[InstrumentInfo]:
        return [
            i
            for i in self.instruments
            if i.symbol == symbol.upper() and (exchange is None or i.exchange == exchange.upper())
        ]

    def daily_bars(self, instrument_id: int) -> list[Bar]:
        return sorted(self.bars.get(instrument_id, []), key=lambda b: b.time)


@pytest.fixture(autouse=True)
def default_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin CORS origins so a developer's own .env cannot change test outcomes."""
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")


def make_client(repo: Any) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_market_repository] = lambda: repo
    return TestClient(app)


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield make_client(FakeMarketRepository([FPT, BTC, NEW], BARS))


# --- GET /api/instruments ----------------------------------------------------


def test_instruments_default_rate(client: TestClient) -> None:
    response = client.get("/api/instruments")
    assert response.status_code == 200
    items = {item["symbol"]: item for item in response.json()}
    assert set(items) == {"FPT", "BTCUSDT", "NEW"}

    fpt = items["FPT"]
    assert fpt["exchange"] == "HOSE"
    assert fpt["asset_class"] == "stock"
    assert fpt["name"] == "FPT Corporation"
    assert fpt["quote_currency"] == "VND"
    assert fpt["last_trade_date"] == "2026-11-03"
    assert fpt["last_close"] == 85900
    assert fpt["last_close_vnd"] == 85900  # VND is not converted
    assert fpt["change_pct"] == pytest.approx((85900 - 86000) / 86000 * 100, abs=1e-4)

    btc = items["BTCUSDT"]
    assert btc["last_close"] == 99
    assert btc["last_close_vnd"] == 99 * 25400  # default rate
    assert btc["change_pct"] == pytest.approx(-10.0)


def test_instruments_custom_rate(client: TestClient) -> None:
    items = {i["symbol"]: i for i in client.get("/api/instruments?usd_vnd_rate=26000").json()}
    assert items["BTCUSDT"]["last_close_vnd"] == 99 * 26000
    assert items["FPT"]["last_close_vnd"] == 85900
    # % change does not depend on the conversion rate.
    assert items["BTCUSDT"]["change_pct"] == pytest.approx(-10.0)


def test_instruments_without_bars_have_null_prices(client: TestClient) -> None:
    new = next(i for i in client.get("/api/instruments").json() if i["symbol"] == "NEW")
    assert new["last_trade_date"] is None
    assert new["last_close"] is None
    assert new["last_close_vnd"] is None
    assert new["change_pct"] is None


@pytest.mark.parametrize("rate", ["0", "-1", "abc", "2000000"])
def test_instruments_rejects_invalid_rate(client: TestClient, rate: str) -> None:
    assert client.get(f"/api/instruments?usd_vnd_rate={rate}").status_code == 422


# --- GET /api/prices/{symbol} -------------------------------------------------


def test_prices_daily_crypto_converted_to_vnd(client: TestClient) -> None:
    response = client.get("/api/prices/BTCUSDT?interval=1d&usd_vnd_rate=25000")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "BTCUSDT"
    assert body["interval"] == "1d"
    assert body["currency"] == "VND"
    assert body["usd_vnd_rate"] == 25000
    assert [b["time"] for b in body["bars"]] == ["2026-10-31", "2026-11-01", "2026-11-02"]
    assert body["bars"][0] == {
        "time": "2026-10-31",
        "open": 100 * 25000,
        "high": 110 * 25000,
        "low": 90 * 25000,
        "close": 105 * 25000,
        "volume": 2.5,  # volume is a quantity: never converted
    }


def test_prices_default_interval_and_rate(client: TestClient) -> None:
    body = client.get("/api/prices/BTCUSDT").json()
    assert body["interval"] == "1d"
    assert body["usd_vnd_rate"] == 25400
    assert body["bars"][-1]["close"] == 99 * 25400


def test_prices_vnd_stock_unchanged_and_symbol_case_insensitive(client: TestClient) -> None:
    body = client.get("/api/prices/fpt?usd_vnd_rate=30000").json()
    assert body["symbol"] == "FPT"
    assert body["usd_vnd_rate"] is None  # rate not applied to VND instruments
    assert body["bars"][-1] == {
        "time": "2026-11-03",
        "open": 86000,
        "high": 87000,
        "low": 85500,
        "close": 85900,
        "volume": 2000,
    }


def test_prices_monthly_resampled(client: TestClient) -> None:
    body = client.get("/api/prices/FPT?interval=1m").json()
    assert body["interval"] == "1m"
    assert body["bars"] == [
        # October: a single session.
        {
            "time": "2026-10-01",
            "open": 84000,
            "high": 86000,
            "low": 83500,
            "close": 85000,
            "volume": 1000,
        },
        # November: open of the first session, close of the last, max/min, summed volume.
        {
            "time": "2026-11-01",
            "open": 85000,
            "high": 87000,
            "low": 84800,
            "close": 85900,
            "volume": 3500,
        },
    ]


def test_prices_monthly_crypto_converted(client: TestClient) -> None:
    bars = client.get("/api/prices/BTCUSDT?interval=1m&usd_vnd_rate=10").json()["bars"]
    ohlcv = [(b["time"], b["open"], b["high"], b["low"], b["close"], b["volume"]) for b in bars]
    assert ohlcv == [
        ("2026-10-01", 1000, 1100, 900, 1050, 2.5),
        ("2026-11-01", 1050, 1200, 950, 990, 7.5),
    ]


def test_prices_instrument_without_bars(client: TestClient) -> None:
    response = client.get("/api/prices/NEW")
    assert response.status_code == 200
    assert response.json()["bars"] == []


def test_prices_unknown_symbol_404(client: TestClient) -> None:
    response = client.get("/api/prices/NOPE")
    assert response.status_code == 404
    assert "NOPE" in response.json()["detail"]


@pytest.mark.parametrize(
    "query",
    ["interval=1w", "interval=1D", "usd_vnd_rate=0", "usd_vnd_rate=-5", "usd_vnd_rate=x"],
)
def test_prices_rejects_invalid_query(client: TestClient, query: str) -> None:
    assert client.get(f"/api/prices/FPT?{query}").status_code == 422


def test_prices_rejects_invalid_symbol(client: TestClient) -> None:
    assert client.get("/api/prices/FP%20T").status_code == 422


def test_prices_ambiguous_symbol_needs_exchange() -> None:
    hnx = InstrumentInfo(9, "FPT", "HNX", "stock", "FPT on HNX", "VND")
    client = make_client(FakeMarketRepository([FPT, hnx], BARS))

    assert client.get("/api/prices/FPT").status_code == 409
    response = client.get("/api/prices/FPT?exchange=hose")
    assert response.status_code == 200
    assert response.json()["exchange"] == "HOSE"


def test_prices_unsupported_quote_currency_422() -> None:
    eur = InstrumentInfo(5, "EURX", "HOSE", "stock", None, "EUR")
    client = make_client(FakeMarketRepository([eur], {}))
    assert client.get("/api/prices/EURX").status_code == 422

    # The list endpoint degrades gracefully instead of failing as a whole.
    [item] = client.get("/api/instruments").json()
    assert item["last_close_vnd"] is None


def test_database_error_returns_503() -> None:
    class BrokenRepository:
        def list_quotes(self) -> list[InstrumentQuote]:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    client = make_client(BrokenRepository())
    response = client.get("/api/instruments", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}
    # The error response is still readable by the browser app.
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


# --- CORS ----------------------------------------------------------------------


def test_cors_preflight_allows_web_app(client: TestClient) -> None:
    response = client.options(
        "/api/instruments",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_simple_get_has_allow_origin(client: TestClient) -> None:
    response = client.get("/api/instruments", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_unknown_origin(client: TestClient) -> None:
    response = client.get("/api/instruments", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_origins_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, http://localhost:4000")
    client = make_client(FakeMarketRepository([FPT], BARS))
    allowed = client.get("/api/instruments", headers={"Origin": "https://app.example.com"})
    assert allowed.headers["access-control-allow-origin"] == "https://app.example.com"
    default = client.get("/api/instruments", headers={"Origin": "http://localhost:3000"})
    assert "access-control-allow-origin" not in default.headers

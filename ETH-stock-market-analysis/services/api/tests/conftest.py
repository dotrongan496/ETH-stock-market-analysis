"""Test fixtures and environment overrides for eth-api."""

from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

# Ensure DATABASE_URL is set before config is imported
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://eth:test@localhost:5432/eth_test")
os.environ.setdefault("APP_ENV", "test")

from eth_api.config import get_settings
from eth_api.main import create_app


@pytest.fixture(autouse=True)
def clean_settings() -> Generator[None, None, None]:
    """Ensure clean cached settings per test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient fixture."""
    app = create_app()
    return TestClient(app)


"""Unit tests for eth_api configuration."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from eth_api.config import Settings


def test_settings_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@host:5432/db")
    monkeypatch.setenv("APP_ENV", "development")
    s = Settings()
    assert s.database_url == "postgresql+psycopg://user:pass@host:5432/db"
    assert s.app_env == "development"
    assert s.log_level == "INFO"


def test_settings_missing_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


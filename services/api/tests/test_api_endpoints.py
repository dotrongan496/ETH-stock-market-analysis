"""Unit tests for FastAPI endpoints."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from eth_api import __version__
from eth_api.db.session import get_session
from eth_api.main import create_app


def test_health_liveness() -> None:
    app = create_app()
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_health_readiness_success() -> None:
    app = create_app()
    mock_session = MagicMock()
    app.dependency_overrides[get_session] = lambda: mock_session

    client = TestClient(app)
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    mock_session.execute.assert_called_once()


def test_health_readiness_failure() -> None:
    app = create_app()
    mock_session = MagicMock()
    mock_session.execute.side_effect = OperationalError("conn failed", {}, Exception())
    app.dependency_overrides[get_session] = lambda: mock_session

    client = TestClient(app)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}


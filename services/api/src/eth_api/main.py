"""FastAPI application factory and health endpoints."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from eth_api import __version__
from eth_api.config import get_settings
from eth_api.db.session import get_session
from eth_api.logging_config import configure_logging

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the FastAPI app."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title="ETH Market Analysis API", version=__version__)

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        """Liveness probe: process is up."""
        return {"status": "ok", "version": __version__}

    @app.get("/health/ready", tags=["health"])
    def ready(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
        """Readiness probe: database reachable."""
        try:
            session.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            logger.warning("Readiness check failed: %s", exc.__class__.__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database unavailable"
            ) from exc
        return {"status": "ready"}

    return app


"""FastAPI application factory: CORS, error handling, health probes and routers."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from eth_api import __version__
from eth_api.config import get_settings
from eth_api.db.session import get_session
from eth_api.logging_config import configure_logging
from eth_api.routers import market

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the FastAPI app."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title="ETH Market Analysis API", version=__version__)

    # Lets the Next.js app (apps/web, http://localhost:3000) call the API from the browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        # Handled here (not as a bare 500) so the response still carries CORS headers.
        logger.warning("Database error: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "database unavailable"},
        )

    app.include_router(market.router)

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


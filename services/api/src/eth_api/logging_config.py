"""Logging setup shared by the API and CLI entry points."""

from __future__ import annotations

import logging

_FORMAT = "%(asctime)s %(levelname)s %(name)s - %(message)s"


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging once; safe to call repeatedly."""
    logging.basicConfig(level=level.upper(), format=_FORMAT, force=True)


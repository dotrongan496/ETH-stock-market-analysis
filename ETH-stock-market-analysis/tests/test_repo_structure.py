"""Repo-level checks: required monorepo layout and secret hygiene."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT: Path = Path(__file__).resolve().parents[1]

REQUIRED_DIRS: tuple[str, ...] = (
    "apps/web",
    "apps/mobile",
    "services/api",
    "services/ml/features",
    "services/ml/train",
    "services/ml/backtest",
    "services/ml/serve",
    "pipelines/dags",
    "pipelines/providers",
    "infra/nginx",
    "infra/grafana",
    "docs/adr",
    "docs/api",
    ".github/workflows",
)

REQUIRED_FILES: tuple[str, ...] = (
    "README.md",
    ".gitignore",
    ".env.example",
    "infra/docker-compose.yml",
    ".github/workflows/ci.yml",
)


@pytest.mark.parametrize("rel_path", REQUIRED_DIRS)
def test_required_dir_exists(rel_path: str) -> None:
    """Every top-level component directory must exist."""
    assert (ROOT / rel_path).is_dir(), f"Missing directory: {rel_path}"


@pytest.mark.parametrize("rel_path", REQUIRED_FILES)
def test_required_file_exists(rel_path: str) -> None:
    """Core config files must exist."""
    assert (ROOT / rel_path).is_file(), f"Missing file: {rel_path}"


def test_gitignore_excludes_env() -> None:
    """`.env` must be ignored while `.env.example` stays tracked."""
    lines = {line.strip() for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()}
    assert ".env" in lines
    assert "!.env.example" in lines


def test_env_example_has_no_real_secrets() -> None:
    """Secret-like keys in `.env.example` must be empty or a placeholder."""
    secret_markers = ("PASSWORD", "SECRET", "TOKEN")
    allowed = {"", "change-me"}
    for raw in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if any(m in key.upper() for m in secret_markers):
            assert value.strip() in allowed, f"{key} looks like a real secret"


def test_compose_has_no_hardcoded_password() -> None:
    """docker-compose must take credentials from env vars only."""
    text = (ROOT / "infra/docker-compose.yml").read_text(encoding="utf-8")
    assert "change-me" not in text
    assert "${POSTGRES_PASSWORD" in text
    assert "${REDIS_PASSWORD" in text


"""Pytest session bootstrap for stable backend DB configuration.

Several test modules set DATABASE_URL independently. Because the SQLAlchemy
engine is instantiated at import time, whichever module imports orm_models
first effectively locks the DB URL for the full process. This file forces a
single writable suite DB path up-front to avoid cross-module read-only races.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_SUITE_DB = Path(tempfile.gettempdir()) / "optiora_pytest_suite.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SUITE_DB}"
os.environ.setdefault("ENABLE_AUTH", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-suite")
os.environ.setdefault("PASSWORD_RESET_RETURN_TOKEN", "true")
os.environ.setdefault("REQUIRE_LIVE_PROVIDER_DATA", "false")

# Import once so engine/session are bound to the suite DB before test modules
# with per-file env overrides are imported.
from finops_mcp.orm_models import Base, engine  # noqa: E402,F401


def pytest_sessionfinish(session, exitstatus):  # type: ignore[no-untyped-def]
    _ = (session, exitstatus)
    try:
        Base.metadata.drop_all(bind=engine)
    except Exception:
        pass
    try:
        _SUITE_DB.unlink()
    except FileNotFoundError:
        pass

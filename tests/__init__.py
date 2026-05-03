"""Shared test package bootstrap defaults."""

from __future__ import annotations

import os

# Most integration tests validate optional CSV/imported fallback workflows.
# Keep strict live-provider mode disabled unless a specific test enables it.
os.environ.setdefault("REQUIRE_LIVE_PROVIDER_DATA", "false")

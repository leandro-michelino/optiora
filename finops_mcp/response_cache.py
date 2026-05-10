"""Small in-process response cache for dashboard JSON GET endpoints.

The cache is intentionally bounded and process-local. It is meant to keep the
dashboard responsive by reusing recent deterministic API responses, while still
allowing explicit refresh requests to bypass and repopulate the cache.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, Optional
from urllib.parse import parse_qsl, urlencode

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


FORCE_REFRESH_QUERY = "force_refresh"
FORCE_REFRESH_HEADER = "x-optiora-force-refresh"
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _normalized_query(query_string: bytes) -> str:
    pairs = parse_qsl(query_string.decode("utf-8", errors="ignore"), keep_blank_values=True)
    filtered = [
        (key, value)
        for key, value in pairs
        if key.lower() not in {FORCE_REFRESH_QUERY, "_refresh", "_cache_bust"}
    ]
    return urlencode(sorted(filtered), doseq=True)


def _query_has_true(query_string: bytes, name: str) -> bool:
    for key, value in parse_qsl(query_string.decode("utf-8", errors="ignore"), keep_blank_values=True):
        if key.lower() == name and str(value).strip().lower() in {"1", "true", "yes"}:
            return True
    return False


def _with_force_refresh_query(path: str, query: str) -> str:
    pairs = parse_qsl(query, keep_blank_values=True)
    pairs.append((FORCE_REFRESH_QUERY, "true"))
    return f"{path}?{urlencode(pairs, doseq=True)}"


def _header_fingerprint(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    cookie = request.headers.get("cookie", "")
    customer = request.headers.get("x-customer-id", "")
    # Keeps pytest cases isolated when they patch internals or seed the DB directly.
    pytest_context = os.environ.get("PYTEST_CURRENT_TEST", "")
    return _hash_value("|".join([authorization, cookie, customer, pytest_context]))


def _refresh_headers(request: Request) -> Dict[str, str]:
    headers: Dict[str, str] = {"accept": "application/json", FORCE_REFRESH_HEADER: "true"}
    for name in ("authorization", "cookie", "x-customer-id"):
        value = request.headers.get(name)
        if value:
            headers[name] = value
    return headers


def request_forces_refresh(request: Request) -> bool:
    if _query_has_true(request.scope.get("query_string", b""), FORCE_REFRESH_QUERY):
        return True
    if request.headers.get(FORCE_REFRESH_HEADER, "").strip().lower() in {"1", "true", "yes"}:
        return True
    cache_control = request.headers.get("cache-control", "").lower()
    pragma = request.headers.get("pragma", "").lower()
    return "no-cache" in cache_control or "no-cache" in pragma


def is_cacheable_dashboard_get(request: Request) -> bool:
    if request.method.upper() != "GET":
        return False
    path = request.url.path
    if not path.startswith("/api/v1/"):
        return False
    if any(path.endswith(suffix) for suffix in (".csv", ".xlsx", ".xls", ".pdf")):
        return False
    if path.startswith(("/api/v1/health", "/api/v1/info")):
        return False
    if "/download" in path or "/export" in path:
        return False
    if path.startswith("/api/v1/scanning/") and path.endswith("/progress"):
        return False
    if _query_has_true(request.scope.get("query_string", b""), "refresh_live"):
        return False
    accept = request.headers.get("accept", "")
    return not accept or "application/json" in accept or "*/*" in accept


def should_invalidate_cache(request: Request, response: Response) -> bool:
    if request.method.upper() not in MUTATING_METHODS:
        return False
    if response.status_code >= 400:
        return False
    return request.url.path.startswith(("/api/v1/", "/auth/"))


@dataclass
class CachedResponse:
    status_code: int
    body: bytes
    content_type: str
    cached_at: float
    path: str
    query: str
    refresh_headers: Dict[str, str] = field(default_factory=dict)
    last_refresh_error: Optional[str] = None


class ApiResponseCache:
    def __init__(self, *, ttl_seconds: int = 300, max_entries: int = 256) -> None:
        self.ttl_seconds = max(30, int(ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self._entries: Dict[str, CachedResponse] = {}
        self._lock = asyncio.Lock()

    def key_for_request(self, request: Request) -> str:
        path = request.url.path
        query = _normalized_query(request.scope.get("query_string", b""))
        identity = _header_fingerprint(request)
        return "|".join([path, query, identity])

    async def get(self, key: str) -> Optional[CachedResponse]:
        async with self._lock:
            return self._entries.get(key)

    async def set(self, key: str, entry: CachedResponse) -> None:
        async with self._lock:
            self._entries[key] = entry
            if len(self._entries) <= self.max_entries:
                return
            oldest_keys = sorted(
                self._entries,
                key=lambda item_key: self._entries[item_key].cached_at,
            )
            for item_key in oldest_keys[: max(1, len(self._entries) - self.max_entries)]:
                self._entries.pop(item_key, None)

    async def snapshot(self) -> Dict[str, CachedResponse]:
        async with self._lock:
            return dict(self._entries)

    async def clear(self) -> int:
        async with self._lock:
            count = len(self._entries)
            self._entries.clear()
            return count

    async def refresh_active_entries(self, app: ASGIApp) -> Dict[str, int]:
        entries = await self.snapshot()
        refreshed = 0
        failed = 0
        if not entries:
            return {"refreshed": 0, "failed": 0, "entries": 0}

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://optiora-cache") as client:
            for entry in entries.values():
                url = _with_force_refresh_query(entry.path, entry.query)
                try:
                    response = await client.get(url, headers=entry.refresh_headers, timeout=120)
                    if response.status_code < 400:
                        refreshed += 1
                    else:
                        failed += 1
                        entry.last_refresh_error = f"HTTP {response.status_code}"
                except Exception as exc:  # pragma: no cover - defensive logging
                    failed += 1
                    entry.last_refresh_error = str(exc)
                    logger.warning("API response cache refresh failed for %s: %s", entry.path, exc)
        return {"refreshed": refreshed, "failed": failed, "entries": len(entries)}


class ApiResponseCacheMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: ASGIApp,
        *,
        cache: ApiResponseCache,
        enabled: Callable[[], bool],
    ) -> None:
        super().__init__(app)
        self.cache = cache
        self.enabled = enabled

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if not self.enabled():
            return await call_next(request)

        if not is_cacheable_dashboard_get(request):
            response = await call_next(request)
            if should_invalidate_cache(request, response):
                cleared = await self.cache.clear()
                response.headers["X-OptiOra-Cache"] = "INVALIDATED"
                response.headers["X-OptiOra-Cache-Invalidated"] = str(cleared)
            return response

        key = self.cache.key_for_request(request)
        now = time.time()
        forced = request_forces_refresh(request)
        cached = await self.cache.get(key)

        if cached is not None and not forced:
            age = max(0, int(now - cached.cached_at))
            if age <= self.cache.ttl_seconds:
                return Response(
                    content=cached.body,
                    status_code=cached.status_code,
                    media_type=cached.content_type,
                    headers={
                        "X-OptiOra-Cache": "HIT",
                        "X-OptiOra-Cache-Age": str(age),
                        "X-OptiOra-Cache-TTL": str(self.cache.ttl_seconds),
                    },
                )

        response = await call_next(request)
        body = b"".join([chunk async for chunk in response.body_iterator])
        content_type = response.headers.get("content-type", "")
        should_store = (
            response.status_code == 200
            and "application/json" in content_type.lower()
            and body
        )
        if should_store:
            await self.cache.set(
                key,
                CachedResponse(
                    status_code=response.status_code,
                    body=body,
                    content_type=content_type.split(";")[0] or "application/json",
                    cached_at=now,
                    path=request.url.path,
                    query=_normalized_query(request.scope.get("query_string", b"")),
                    refresh_headers=_refresh_headers(request),
                ),
            )

        headers = dict(response.headers)
        headers["X-OptiOra-Cache"] = "BYPASS" if forced else "MISS"
        headers["X-OptiOra-Cache-TTL"] = str(self.cache.ttl_seconds)
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
            background=response.background,
        )


async def run_response_cache_refresher(
    *,
    app: ASGIApp,
    cache: ApiResponseCache,
    interval_seconds: int,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    interval = max(60, int(interval_seconds))
    while True:
        await sleep(interval)
        try:
            result = await cache.refresh_active_entries(app)
            logger.info("API response cache refresh result: %s", result)
        except Exception:  # pragma: no cover - defensive background loop
            logger.exception("API response cache refresh loop failed")

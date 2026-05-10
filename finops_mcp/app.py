"""Main FastAPI application for OptiOra."""

import argparse
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Config
from . import __version__
from .api import router as api_router, run_scheduled_scans_once
from .auth_routes import router as auth_router
from .orm_models import ensure_public_workspace, init_db
from .retention import run_retention
from .response_cache import ApiResponseCache, ApiResponseCacheMiddleware, run_response_cache_refresher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
_scheduler_task: asyncio.Task | None = None
_retention_task: asyncio.Task | None = None
_response_cache_task: asyncio.Task | None = None
_response_cache_enabled = False
api_response_cache = ApiResponseCache()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await startup_event()
    try:
        yield
    finally:
        await shutdown_event()


def _resolve_allowed_origins() -> list[str]:
    """Build CORS allowlist from defaults plus env overrides."""
    origins = {
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "https://localhost:3000",
        "https://127.0.0.1:3000",
    }
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        origins.add(frontend_url)

    frontend_urls = os.getenv("FRONTEND_URLS", "").strip()
    if frontend_urls:
        for url in frontend_urls.split(","):
            value = url.strip()
            if value:
                origins.add(value)

    return sorted(origins)


def _coerce_request_id(raw_request_id: str | None) -> str:
    candidate = str(raw_request_id or "").strip()
    if not candidate or len(candidate) > 128:
        return uuid4().hex
    if any(not (ch.isalnum() or ch in {"-", "_", "."}) for ch in candidate):
        return uuid4().hex
    return candidate

# Create FastAPI app
app = FastAPI(
    title="OptiOra API",
    description="Multi-Cloud Cost Optimization Platform",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    ApiResponseCacheMiddleware,
    cache=api_response_cache,
    enabled=lambda: _response_cache_enabled,
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = _coerce_request_id(request.headers.get("x-request-id"))
    request.state.request_id = request_id
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
    return response


# CORS middleware is added after application middleware so it remains the
# outermost layer and decorates cached hits as well as live responses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Cache-Control",
        "Pragma",
        "X-Requested-With",
        "X-Request-ID",
        "X-OptiOra-Force-Refresh",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-Response-Time-Ms",
        "X-OptiOra-Cache",
        "X-OptiOra-Cache-Age",
        "X-OptiOra-Cache-TTL",
        "X-OptiOra-Cache-Invalidated",
    ],
)


# Initialize database
async def startup_event():
    """Initialize database on startup."""
    try:
        cfg = Config()
        cfg.validate()
        init_db()
        if not cfg.auth_enabled:
            ensure_public_workspace()
        if cfg.enable_scan_scheduler:
            interval_seconds = max(300, cfg.scan_scheduler_interval_minutes * 60)

            async def _scheduler_loop():
                while True:
                    try:
                        result = await run_scheduled_scans_once()
                        logger.info("Scheduled scan loop result: %s", result)
                    except Exception:
                        logger.exception("Scheduled scan loop failed")
                    await asyncio.sleep(interval_seconds)

            global _scheduler_task
            _scheduler_task = asyncio.create_task(_scheduler_loop())
            logger.info("Scheduled scan runner enabled (interval=%ss)", interval_seconds)

        global _response_cache_task, _response_cache_enabled, api_response_cache
        _response_cache_enabled = bool(cfg.enable_api_response_cache)
        if _response_cache_enabled:
            api_response_cache.ttl_seconds = max(30, int(cfg.api_response_cache_ttl_seconds))
            api_response_cache.max_entries = max(1, int(cfg.api_response_cache_max_entries))
            refresh_interval = max(60, int(cfg.api_response_cache_refresh_interval_seconds))
            _response_cache_task = asyncio.create_task(
                run_response_cache_refresher(
                    app=app,
                    cache=api_response_cache,
                    interval_seconds=refresh_interval,
                )
            )
            logger.info(
                "API response cache enabled (ttl=%ss, refresh_interval=%ss, max_entries=%s)",
                api_response_cache.ttl_seconds,
                refresh_interval,
                api_response_cache.max_entries,
            )

        if cfg.retention_enabled:
            retention_interval = max(3600, cfg.retention_run_interval_hours * 3600)

            async def _retention_loop():
                while True:
                    try:
                        summary = await asyncio.to_thread(run_retention, cfg)
                        logger.info("Retention run complete: %s", summary)
                    except Exception:
                        logger.exception("Retention loop failed")
                    await asyncio.sleep(retention_interval)

            global _retention_task
            _retention_task = asyncio.create_task(_retention_loop())
            logger.info(
                "Retention runner enabled (hot_months=%d, interval=%sh, bucket=%s)",
                cfg.retention_hot_months,
                cfg.retention_run_interval_hours,
                cfg.oci_archive_bucket,
            )
        logger.info("Database initialized successfully (version=%s)", __version__)
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise RuntimeError("Database initialization failed") from e


async def shutdown_event():
    """Stop background scheduler task cleanly."""
    global _scheduler_task, _retention_task, _response_cache_task
    for task in (_scheduler_task, _retention_task, _response_cache_task):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    _scheduler_task = None
    _retention_task = None
    _response_cache_task = None


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": __version__,
    }


# Include routers
app.include_router(auth_router)
app.include_router(api_router)


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    request_id = getattr(getattr(request, "state", None), "request_id", None)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


def main(argv: list[str] | None = None) -> None:
    """Run the FastAPI backend with uvicorn."""
    parser = argparse.ArgumentParser(prog="optiora", description="Run the OptiOra API backend.")
    parser.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn auto-reload.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    args = parser.parse_args(argv)

    uvicorn.run(
        "finops_mcp.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload or os.getenv("UVICORN_RELOAD", "false").lower() == "true",
    )


if __name__ == "__main__":
    main()

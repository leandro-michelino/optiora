"""Main FastAPI application for OptiOra."""

import argparse
import asyncio
import logging
import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Config
from . import __version__
from .api import router as api_router, run_scheduled_scans_once
from .auth_routes import router as auth_router
from .orm_models import ensure_public_workspace, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
_scheduler_task: asyncio.Task | None = None


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

# Create FastAPI app
app = FastAPI(
    title="OptiOra API",
    description="Multi-Cloud Cost Optimization Platform",
    version=__version__,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    try:
        init_db()
        if not Config().auth_enabled:
            ensure_public_workspace()
        if Config().enable_scan_scheduler:
            interval_seconds = max(300, Config().scan_scheduler_interval_minutes * 60)

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
        logger.info("Database initialized successfully (version=%s)", __version__)
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise RuntimeError("Database initialization failed") from e


@app.on_event("shutdown")
async def shutdown_event():
    """Stop background scheduler task cleanly."""
    global _scheduler_task
    if _scheduler_task is not None:
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        _scheduler_task = None


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
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
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

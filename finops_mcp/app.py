"""Main FastAPI application for OptiOra."""

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os

from .orm_models import init_db
from .auth_routes import router as auth_router
from .api import router as api_router
from . import __version__

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _resolve_allowed_origins() -> list[str]:
    """Build CORS allowlist from defaults plus env overrides."""
    origins = {
        "http://localhost:3000",
        "http://localhost:8000",
        "https://localhost:3000",
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
        logger.info("Database initialized successfully (version=%s)", __version__)
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise RuntimeError("Database initialization failed") from e


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


def main() -> None:
    """Run the FastAPI backend with uvicorn."""
    uvicorn.run(
        "finops_mcp.app:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("UVICORN_RELOAD", "false").lower() == "true",
    )


if __name__ == "__main__":
    main()

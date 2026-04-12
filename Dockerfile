FROM python:3.11-slim

LABEL maintainer="OptiOra Team"
LABEL description="OptiOra - Multi-Cloud Cost Optimization MCP deployed on OCI"
LABEL version="0.1.0"

WORKDIR /app

# Install Poetry
RUN pip install --no-cache-dir poetry

# Copy project files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry install --no-dev --no-interaction --no-ansi

# Copy source code
COPY finops_mcp ./finops_mcp

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Run OptiOra server
CMD ["poetry", "run", "optiora"]

# --------- Builder Stage ---------
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

# Set environment variables for uv
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./

# Install dependencies first (for better layer caching)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

# Copy the project source code
COPY src /app/src
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Install the project in non-editable mode
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable

# --------- Test Builder Stage ---------
FROM builder AS test-builder

# Add dev/test dependencies on top of the base virtualenv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --extra dev --group dev --no-editable

# --------- Runtime Base Stage ---------
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS runtime-base

# Create a non-root user for security
RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid app --shell /bin/bash --create-home app

# Ensure the virtual environment is in the PATH
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Switch to the non-root user
USER app

# Set the working directory
WORKDIR /code

# --------- Test Stage ---------
FROM runtime-base AS test

# Copy test virtual environment (includes dev dependencies)
COPY --from=test-builder --chown=app:app /app/.venv /app/.venv

CMD ["python", "-m", "pytest", "./tests"]

# --------- Final Stage ---------
FROM runtime-base AS production

# Copy production virtual environment (without dev dependencies)
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/src /code/src
COPY --chown=app:app src/migrations /code/migrations
COPY --chown=app:app src/alembic.ini /code/alembic.ini
COPY --chown=app:app docker-entrypoint.sh /code/docker-entrypoint.sh
RUN chmod +x /code/docker-entrypoint.sh

ENTRYPOINT ["/code/docker-entrypoint.sh"]

LABEL org.opencontainers.image.source=https://github.com/webserialsys/superuart

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "from urllib.request import urlopen; import sys; sys.exit(0 if urlopen('http://127.0.0.1:8000/api/v1/ready').status == 200 else 1)"]

# CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
CMD ["gunicorn", "src.app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-"]

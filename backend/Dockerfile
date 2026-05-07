FROM python:3.11-slim-trixie AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app


FROM base AS production

ENV UV_NO_DEV=1

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src
COPY docker-entrypoint.sh ./

RUN uv sync --locked --no-dev \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app \
    && chown -R app:app /app

USER app

EXPOSE 8000

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "uv run --no-sync gunicorn src.app.main:app -w ${WEB_CONCURRENCY:-1} -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000"]


FROM base AS test

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --extra dev --group dev --no-install-project

COPY src ./src
COPY tests ./tests
COPY docker-entrypoint.sh ./

RUN uv sync --locked --extra dev --group dev

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["uv", "run", "--no-sync", "pytest", "tests"]

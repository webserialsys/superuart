#!/bin/sh
set -eu

run_migrations() {
  if [ ! -f "/app/src/alembic.ini" ]; then
    echo "alembic.ini not found at /app/src/alembic.ini"
    exit 1
  fi

  cd /app/src
  max_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"
  retry_delay="${MIGRATION_RETRY_DELAY_SECONDS:-2}"
  attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if uv run alembic upgrade head; then
      break
    fi

    if [ "$attempt" -eq "$max_attempts" ]; then
      echo "alembic upgrade head failed after ${max_attempts} attempts"
      exit 1
    fi

    echo "alembic upgrade failed (attempt ${attempt}/${max_attempts}), retrying in ${retry_delay}s..."
    attempt=$((attempt + 1))
    sleep "$retry_delay"
  done
}

if [ "${1:-}" = "migrate" ]; then
  run_migrations
  exit 0
fi

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  run_migrations
fi

exec "$@"

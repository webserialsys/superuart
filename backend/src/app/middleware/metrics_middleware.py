import os
import time
from collections.abc import Collection

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, Info, generate_latest
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

POD_NAME = os.getenv("POD_NAME", "unknown")

APP_INFO = Info("superuart_app", "SuperUART application build information")

HTTP_REQUESTS = Counter(
    "superuart_http_requests",
    "Total HTTP requests handled by the backend.",
    ("method", "route", "status_code", "pod"),
)

HTTP_REQUEST_DURATION = Histogram(
    "superuart_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "route", "status_code", "pod"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "superuart_http_requests_in_progress",
    "HTTP requests currently being processed by the backend.",
    ("method", "pod"),
)


def configure_app_info(version: str | None, environment: str | None) -> None:
    APP_INFO.info(
        {
            "version": version or "unknown",
            "environment": environment or "unknown",
            "pod": POD_NAME,
        }
    )


def metrics_response(_request: Request) -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


class PrometheusMetricsMiddleware:
    def __init__(self, app: ASGIApp, excluded_paths: Collection[str] | None = None) -> None:
        self.app = app
        self.excluded_paths = set(excluded_paths or ())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))
        if path in self.excluded_paths:
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method", "UNKNOWN")).upper()
        route = "unmatched"
        status_code = "500"
        start = time.perf_counter()
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, pod=POD_NAME).inc()

        async def send_wrapper(message: Message) -> None:
            nonlocal route, status_code
            if message["type"] == "http.response.start":
                route = get_route_label(scope)
                status_code = str(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            route = get_route_label(scope)
            HTTP_REQUESTS.labels(method=method, route=route, status_code=status_code, pod=POD_NAME).inc()
            HTTP_REQUEST_DURATION.labels(method=method, route=route, status_code=status_code, pod=POD_NAME).observe(
                time.perf_counter() - start
            )
            raise
        else:
            HTTP_REQUESTS.labels(method=method, route=route, status_code=status_code, pod=POD_NAME).inc()
            HTTP_REQUEST_DURATION.labels(method=method, route=route, status_code=status_code, pod=POD_NAME).observe(
                time.perf_counter() - start
            )
        finally:
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, pod=POD_NAME).dec()


def get_route_label(scope: Scope) -> str:
    route = scope.get("route")
    route_path = getattr(route, "path_format", None) or getattr(route, "path", None)
    if route_path:
        return str(route_path)
    return "unmatched"

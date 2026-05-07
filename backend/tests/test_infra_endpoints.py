from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException, Response

from src.app.api.v1.health import health, ready
from src.app.api.v1.logout import logout
from src.app.api.v1.tasks import create_task, get_task
from src.app.core.db.database import async_get_db
from src.app.core.exceptions.http_exceptions import UnauthorizedException
from src.app.core.utils.cache import async_get_redis
from src.app.main import app


@pytest.mark.asyncio
async def test_health_returns_healthy_payload():
    response = await health()

    assert response.status_code == 200
    payload = response.body.decode("utf-8")
    assert '"status":"healthy"' in payload
    assert '"environment"' in payload
    assert '"version"' in payload
    assert '"timestamp"' in payload


@pytest.mark.asyncio
async def test_ready_returns_healthy_when_dependencies_ok():
    with (
        patch("src.app.api.v1.health.check_database_health", AsyncMock(return_value=True)),
        patch("src.app.api.v1.health.check_redis_health", AsyncMock(return_value=True)),
    ):
        response = await ready(redis=Mock(), db=Mock())

    assert response.status_code == 200
    payload = response.body.decode("utf-8")
    assert '"status":"healthy"' in payload
    assert '"database":"healthy"' in payload
    assert '"redis":"healthy"' in payload


@pytest.mark.asyncio
async def test_ready_returns_unhealthy_when_dependency_fails():
    with (
        patch("src.app.api.v1.health.check_database_health", AsyncMock(return_value=False)),
        patch("src.app.api.v1.health.check_redis_health", AsyncMock(return_value=True)),
    ):
        response = await ready(redis=Mock(), db=Mock())

    assert response.status_code == 503
    payload = response.body.decode("utf-8")
    assert '"status":"unhealthy"' in payload
    assert '"database":"unhealthy"' in payload
    assert '"redis":"healthy"' in payload


@pytest.mark.asyncio
async def test_logout_success_clears_cookie():
    response = Response()

    result = await logout(
        response=response,
        access_token="access-token",
        refresh_token="refresh-token",
    )

    assert result == {"message": "Logged out successfully"}
    assert "refresh_token=" in response.headers.get("set-cookie", "")


@pytest.mark.asyncio
async def test_logout_requires_refresh_token():
    with pytest.raises(UnauthorizedException, match="Refresh token not found"):
        await logout(response=Response(), access_token="access-token", refresh_token=None)


@pytest.mark.asyncio
async def test_create_task_returns_503_when_queue_unavailable():
    with patch("src.app.api.v1.tasks.queue.pool", None):
        with pytest.raises(HTTPException, match="Queue is not available") as exc_info:
            await create_task("hello")

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_create_task_returns_500_when_enqueue_fails():
    pool = Mock()
    pool.enqueue_job = AsyncMock(return_value=None)

    with patch("src.app.api.v1.tasks.queue.pool", pool):
        with pytest.raises(HTTPException, match="Failed to create task") as exc_info:
            await create_task("hello")

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_create_task_success():
    pool = Mock()
    pool.enqueue_job = AsyncMock(return_value=SimpleNamespace(job_id="job-123"))

    with patch("src.app.api.v1.tasks.queue.pool", pool):
        result = await create_task("hello")

    assert result == {"id": "job-123"}
    pool.enqueue_job.assert_awaited_once_with("sample_background_task", "hello")


@pytest.mark.asyncio
async def test_get_task_returns_503_when_queue_unavailable():
    with patch("src.app.api.v1.tasks.queue.pool", None):
        with pytest.raises(HTTPException, match="Queue is not available") as exc_info:
            await get_task("job-123")

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_get_task_returns_none_when_job_missing():
    mock_job = Mock()
    mock_job.info = AsyncMock(return_value=None)

    with (
        patch("src.app.api.v1.tasks.queue.pool", Mock()),
        patch("src.app.api.v1.tasks.ArqJob", return_value=mock_job),
    ):
        result = await get_task("job-123")

    assert result is None
    mock_job.info.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_task_returns_job_info_dict():
    job_info = SimpleNamespace(job_id="job-123", status="complete", result={"ok": True})
    mock_job = Mock()
    mock_job.info = AsyncMock(return_value=job_info)

    with (
        patch("src.app.api.v1.tasks.queue.pool", Mock()),
        patch("src.app.api.v1.tasks.ArqJob", return_value=mock_job),
    ):
        result = await get_task("job-123")

    assert result == job_info.__dict__


def test_ws_uart_mock_stream_and_echo(client, mock_redis, mock_db):
    from uuid6 import uuid7

    device_uuid = uuid7()
    connection_id = uuid7()
    mock_redis.get = AsyncMock(
        return_value=f'{{"connection_id":"{connection_id}","user_uuid":"{uuid7()}"}}',
    )

    app.dependency_overrides[async_get_redis] = lambda: mock_redis
    app.dependency_overrides[async_get_db] = lambda: mock_db
    try:
        with client.websocket_connect(
            f"/api/v1/ws/uart/{device_uuid}?connection_id={connection_id}",
        ) as websocket:
            first = websocket.receive_text()
            second = websocket.receive_text()

            assert f"Connected to mock UART: {device_uuid}" in first
            assert "Mock stream started" in second

            websocket.send_text("ping")

            seen_echo = False
            for _ in range(4):
                message = websocket.receive_text()
                if message.startswith("echo> ping"):
                    seen_echo = True
                    break

            assert seen_echo, "Expected echo response from mock UART websocket"
    finally:
        app.dependency_overrides.pop(async_get_redis, None)
        app.dependency_overrides.pop(async_get_db, None)

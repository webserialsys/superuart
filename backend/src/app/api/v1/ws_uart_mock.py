import asyncio
import contextlib
import random
import uuid as uuid_pkg
from datetime import UTC, datetime

from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.db.database import async_get_db
from ...core.utils.cache import async_get_redis
from ...crud.crud_sessions import crud_sessions
from .sessions import (
    _decode_device_lock,
    _device_session_key,
    _encode_device_lock,
    _expire_session,
    _expires_to_ttl,
    _is_lock_disconnect_expired,
    _normalize_datetime,
    _status_is_active,
)

router = APIRouter(prefix="/ws", tags=["ws-mock"])
DEFAULT_UART_BAUDRATE = 115200


async def _set_lock_connection_state(
    redis: Redis,
    lock_key: str,
    lock: dict[str, str | None],
    disconnected_at: datetime | None,
) -> None:
    user_uuid_raw = lock.get("user_uuid")
    connection_id_raw = lock.get("connection_id")
    if user_uuid_raw is None or connection_id_raw is None:
        return

    try:
        user_uuid = uuid_pkg.UUID(user_uuid_raw)
        connection_id = uuid_pkg.UUID(connection_id_raw)
    except ValueError:
        return

    session_uuid = None
    session_uuid_raw = lock.get("session_uuid")
    if session_uuid_raw is not None:
        try:
            session_uuid = uuid_pkg.UUID(session_uuid_raw)
        except ValueError:
            session_uuid = None

    expires_at = _normalize_datetime(lock.get("expires_at"))
    ttl_seconds = _expires_to_ttl(expires_at)
    value = _encode_device_lock(
        user_uuid=user_uuid,
        connection_id=connection_id,
        expires_at=expires_at,
        session_uuid=session_uuid,
        disconnected_at=disconnected_at,
    )

    if ttl_seconds is None:
        await redis.set(lock_key, value)
    else:
        await redis.set(lock_key, value, ex=ttl_seconds)


async def _expire_lock_session_if_needed(
    db: AsyncSession,
    redis: Redis,
    lock_key: str,
    lock: dict[str, str | None],
) -> None:
    session_uuid_raw = lock.get("session_uuid")
    if session_uuid_raw is None:
        await redis.delete(lock_key)
        return

    try:
        session_uuid = uuid_pkg.UUID(session_uuid_raw)
    except ValueError:
        await redis.delete(lock_key)
        return

    db_session = await crud_sessions.get(db=db, uuid=session_uuid, is_deleted=False)
    if db_session is None:
        await redis.delete(lock_key)
        return

    if _status_is_active(db_session.get("status")):
        await _expire_session(db=db, redis=redis, session=db_session)


@router.websocket("/uart/{device_uuid}")
async def mock_uart(
    websocket: WebSocket,
    device_uuid: str,
    redis: Annotated[Redis, Depends(async_get_redis)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> None:
    connection_id_raw = websocket.query_params.get("connection_id")
    baudrate_raw = websocket.query_params.get("baudrate")
    try:
        device_uuid_value = uuid_pkg.UUID(device_uuid)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid device uuid")
        return

    if not connection_id_raw:
        await websocket.close(code=1008, reason="Missing connection id")
        return

    try:
        connection_id = uuid_pkg.UUID(connection_id_raw)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid connection id")
        return

    baudrate = DEFAULT_UART_BAUDRATE
    if baudrate_raw:
        try:
            baudrate = int(baudrate_raw)
        except ValueError:
            await websocket.close(code=1008, reason="Invalid baudrate")
            return
        if baudrate <= 0:
            await websocket.close(code=1008, reason="Invalid baudrate")
            return

    lock_key = _device_session_key(device_uuid_value)
    current_lock = _decode_device_lock(await redis.get(lock_key))
    if current_lock is None:
        await websocket.close(code=1008, reason="Session not active")
        return

    if current_lock.get("connection_id") != str(connection_id):
        await websocket.close(code=1008, reason="Device is busy")
        return

    if _is_lock_disconnect_expired(current_lock, datetime.now(UTC)):
        await _expire_lock_session_if_needed(db=db, redis=redis, lock_key=lock_key, lock=current_lock)
        await websocket.close(code=1008, reason="Session expired")
        return

    await _set_lock_connection_state(redis=redis, lock_key=lock_key, lock=current_lock, disconnected_at=None)

    await websocket.accept()
    await websocket.send_text(f"Connected to mock UART: {device_uuid}\r\n")
    await websocket.send_text("Mock stream started. Type in terminal to test echo.\r\n")
    await websocket.send_text(f"UART baudrate: {baudrate} bps\r\n")

    async def lock_guard() -> None:
        while True:
            current_value = _decode_device_lock(await redis.get(lock_key))
            if current_value is None or current_value.get("connection_id") != str(connection_id):
                with contextlib.suppress(RuntimeError):
                    await websocket.close(code=1008, reason="Device reassigned")
                break
            await asyncio.sleep(1)

    async def producer() -> None:
        counter = 0
        while True:
            counter += 1
            voltage = 3.20 + random.random() * 0.15
            temperature = 24.0 + random.random() * 3.0
            timestamp = datetime.now().strftime("%H:%M:%S")
            await websocket.send_text(
                f"[{timestamp}] seq={counter} V={voltage:.2f}V T={temperature:.1f}C\r\n",
            )
            await asyncio.sleep(1)

    producer_task = asyncio.create_task(producer())
    lock_task = asyncio.create_task(lock_guard())

    try:
        while True:
            payload = await websocket.receive_text()
            await websocket.send_text(f"echo> {payload}\r\n")
    except WebSocketDisconnect:
        pass
    finally:
        producer_task.cancel()
        lock_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await producer_task
            await lock_task

        latest_lock = _decode_device_lock(await redis.get(lock_key))
        if latest_lock is not None and latest_lock.get("connection_id") == str(connection_id):
            await _set_lock_connection_state(
                redis=redis,
                lock_key=lock_key,
                lock=latest_lock,
                disconnected_at=datetime.now(UTC),
            )

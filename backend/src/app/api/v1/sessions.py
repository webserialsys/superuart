import json
import uuid as uuid_pkg
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import ForbiddenException, NotFoundException
from ...core.utils.cache import async_get_redis
from ...crud.crud_devices import crud_devices
from ...crud.crud_sessions import crud_sessions
from ...models.enums import DeviceStatus, SessionStatus, UserRole
from ...schemas.device import DeviceUpdate
from ...schemas.session import SessionCreate, SessionCreateInternal, SessionRead, SessionUpdate

router = APIRouter(tags=["sessions"])

DEVICE_SESSION_PREFIX = "device-session"
SESSION_MAX_DURATION = timedelta(minutes=30)
DISCONNECT_GRACE_PERIOD = timedelta(minutes=5)


def _is_teacher(user: dict) -> bool:
    role = user.get("role")
    return role in {UserRole.TEACHER, UserRole.TEACHER.value}


def _status_is_active(value: SessionStatus | str | None) -> bool:
    return value in {SessionStatus.ACTIVE, SessionStatus.ACTIVE.value}


def _status_is_unavailable(value: DeviceStatus | str | None) -> bool:
    return value in {DeviceStatus.UNAVAILABLE, DeviceStatus.UNAVAILABLE.value}


def _normalize_uuid(value: uuid_pkg.UUID | str) -> uuid_pkg.UUID:
    if isinstance(value, uuid_pkg.UUID):
        return value
    return uuid_pkg.UUID(value)


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _normalize_datetime(value: datetime | str | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        candidate = value.replace("Z", "+00:00")
        try:
            value = datetime.fromisoformat(candidate)
        except ValueError:
            return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _device_session_key(device_uuid: uuid_pkg.UUID) -> str:
    return f"{DEVICE_SESSION_PREFIX}:{device_uuid}"


def _decode_redis_value(value: bytes | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode()
    return value


def _encode_device_lock(
    user_uuid: uuid_pkg.UUID,
    connection_id: uuid_pkg.UUID,
    expires_at: datetime | None,
    session_uuid: uuid_pkg.UUID | None = None,
    disconnected_at: datetime | None = None,
) -> str:
    payload: dict[str, str] = {
        "user_uuid": str(user_uuid),
        "connection_id": str(connection_id),
    }
    if session_uuid is not None:
        payload["session_uuid"] = str(session_uuid)
    normalized_expiry = _normalize_datetime(expires_at)
    if normalized_expiry is not None:
        payload["expires_at"] = normalized_expiry.isoformat()
    normalized_disconnected = _normalize_datetime(disconnected_at)
    if normalized_disconnected is not None:
        payload["disconnected_at"] = normalized_disconnected.isoformat()
    return json.dumps(payload)


def _decode_device_lock(value: bytes | str | None) -> dict[str, str | None] | None:
    raw = _decode_redis_value(value)
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "user_uuid": None,
            "connection_id": raw,
            "session_uuid": None,
            "expires_at": None,
            "disconnected_at": None,
        }
    if not isinstance(parsed, dict):
        return None
    connection_id = parsed.get("connection_id")
    user_uuid = parsed.get("user_uuid")
    session_uuid = parsed.get("session_uuid")
    expires_at = parsed.get("expires_at")
    disconnected_at = parsed.get("disconnected_at")
    if not isinstance(connection_id, str):
        return None
    return {
        "user_uuid": user_uuid if isinstance(user_uuid, str) else None,
        "connection_id": connection_id,
        "session_uuid": session_uuid if isinstance(session_uuid, str) else None,
        "expires_at": expires_at if isinstance(expires_at, str) else None,
        "disconnected_at": disconnected_at if isinstance(disconnected_at, str) else None,
    }


def _expires_to_ttl(expires_at: datetime | str | None) -> int | None:
    normalized_expiry = _normalize_datetime(expires_at)
    if normalized_expiry is None:
        return None
    ttl_seconds = int((normalized_expiry - _now_utc()).total_seconds())
    if ttl_seconds <= 0:
        return 1
    return ttl_seconds


def _normalize_requested_expiry(expires_at: datetime | None, now: datetime) -> datetime:
    max_expiry = now + SESSION_MAX_DURATION
    requested_expiry = _normalize_datetime(expires_at)
    if requested_expiry is None or requested_expiry <= now:
        return max_expiry
    return requested_expiry if requested_expiry <= max_expiry else max_expiry


def _cap_existing_expiry(expires_at: datetime | str | None, created_at: datetime | str | None, now: datetime) -> datetime:
    base_created_at = _normalize_datetime(created_at) or now
    max_expiry = base_created_at + SESSION_MAX_DURATION
    effective_expiry = _normalize_datetime(expires_at) or max_expiry
    return effective_expiry if effective_expiry <= max_expiry else max_expiry


def _is_lock_disconnect_expired(lock: dict[str, str | None], now: datetime) -> bool:
    disconnected_at = _normalize_datetime(lock.get("disconnected_at"))
    if disconnected_at is None:
        return False
    return now - disconnected_at > DISCONNECT_GRACE_PERIOD


async def _acquire_device_lock(
    redis: Redis,
    device_uuid: uuid_pkg.UUID,
    user_uuid: uuid_pkg.UUID,
    connection_id: uuid_pkg.UUID,
    expires_at: datetime | None,
    session_uuid: uuid_pkg.UUID | None = None,
    disconnected_at: datetime | None = None,
) -> bool:
    key = _device_session_key(device_uuid)
    ttl_seconds = _expires_to_ttl(expires_at)
    value = _encode_device_lock(
        user_uuid=user_uuid,
        connection_id=connection_id,
        expires_at=expires_at,
        session_uuid=session_uuid,
        disconnected_at=disconnected_at,
    )
    set_kwargs: dict[str, Any] = {"nx": True}
    if ttl_seconds is not None:
        set_kwargs["ex"] = ttl_seconds
    return bool(await redis.set(key, value, **set_kwargs))


async def _ensure_device_lock(
    redis: Redis,
    device_uuid: uuid_pkg.UUID,
    user_uuid: uuid_pkg.UUID,
    connection_id: uuid_pkg.UUID,
    expires_at: datetime | None,
    session_uuid: uuid_pkg.UUID | None = None,
    disconnected_at: datetime | None = None,
) -> None:
    key = _device_session_key(device_uuid)
    ttl_seconds = _expires_to_ttl(expires_at)
    value = _encode_device_lock(
        user_uuid=user_uuid,
        connection_id=connection_id,
        expires_at=expires_at,
        session_uuid=session_uuid,
        disconnected_at=disconnected_at,
    )
    if ttl_seconds is None:
        await redis.set(key, value)
    else:
        await redis.set(key, value, ex=ttl_seconds)


async def _release_device_lock(
    redis: Redis,
    device_uuid: uuid_pkg.UUID,
    user_uuid: uuid_pkg.UUID,
    connection_id: uuid_pkg.UUID,
) -> bool:
    key = _device_session_key(device_uuid)
    lock = _decode_device_lock(await redis.get(key))
    if lock is None:
        return True
    if lock.get("user_uuid") is not None and lock.get("user_uuid") != str(user_uuid):
        return False
    if lock.get("connection_id") != str(connection_id):
        return False
    await redis.delete(key)
    return True


async def _get_active_session_for_device(db: AsyncSession, device_uuid: uuid_pkg.UUID) -> dict[str, Any] | None:
    return await crud_sessions.get(
        db=db,
        device_uuid=device_uuid,
        status=SessionStatus.ACTIVE,
        is_deleted=False,
        schema_to_select=SessionRead,
    )


async def _set_device_status(db: AsyncSession, device_uuid: uuid_pkg.UUID, status: DeviceStatus) -> None:
    db_device = await crud_devices.get(db=db, uuid=device_uuid, is_deleted=False)
    if db_device is None:
        return
    if _status_is_unavailable(db_device.get("status")) and status != DeviceStatus.UNAVAILABLE:
        return
    await crud_devices.update(db=db, object=DeviceUpdate(status=status), uuid=device_uuid)


async def _expire_session(db: AsyncSession, redis: Redis, session: dict[str, Any]) -> bool:
    session_uuid_raw = session.get("uuid")
    device_uuid_raw = session.get("device_uuid")
    connection_id_raw = session.get("connection_id")
    user_uuid_raw = session.get("user_uuid")

    if session_uuid_raw is None or device_uuid_raw is None:
        return False

    session_uuid = _normalize_uuid(str(session_uuid_raw))
    device_uuid = _normalize_uuid(str(device_uuid_raw))

    await crud_sessions.update(db=db, object=SessionUpdate(status=SessionStatus.EXPIRED), uuid=session_uuid)

    key = _device_session_key(device_uuid)
    lock = _decode_device_lock(await redis.get(key))
    if lock is not None:
        should_delete_lock = False
        lock_session_uuid = lock.get("session_uuid")
        if lock_session_uuid is not None and lock_session_uuid == str(session_uuid):
            should_delete_lock = True
        elif connection_id_raw is not None and lock.get("connection_id") == str(connection_id_raw):
            if user_uuid_raw is None or lock.get("user_uuid") in {None, str(user_uuid_raw)}:
                should_delete_lock = True

        if should_delete_lock:
            await redis.delete(key)

    await _set_device_status(db=db, device_uuid=device_uuid, status=DeviceStatus.AVAILABLE)
    return True


async def _expire_session_if_needed(db: AsyncSession, redis: Redis, session: dict[str, Any]) -> bool:
    if not _status_is_active(session.get("status")):
        return False

    now = _now_utc()
    effective_expiry = _cap_existing_expiry(session.get("expires_at"), session.get("created_at"), now)
    if effective_expiry <= now:
        return await _expire_session(db=db, redis=redis, session=session)

    device_uuid_raw = session.get("device_uuid")
    if device_uuid_raw is None:
        return False

    lock = _decode_device_lock(await redis.get(_device_session_key(_normalize_uuid(str(device_uuid_raw)))))
    if lock is None:
        return False

    lock_session_uuid = lock.get("session_uuid")
    session_uuid = session.get("uuid")
    if lock_session_uuid is not None and session_uuid is not None and lock_session_uuid != str(session_uuid):
        return False

    if _is_lock_disconnect_expired(lock, now):
        return await _expire_session(db=db, redis=redis, session=session)

    return False


@router.post("/session", response_model=SessionRead, status_code=201)
async def write_session(
    request: Request,
    session: SessionCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
) -> dict[str, Any]:
    session_payload = session.model_dump()
    if not _is_teacher(current_user):
        session_payload["user_uuid"] = _normalize_uuid(current_user["uuid"])

    session_internal = SessionCreateInternal(**session_payload)
    lock_acquired = False

    if session_internal.status == SessionStatus.ACTIVE:
        db_device = await crud_devices.get(
            db=db,
            uuid=session_internal.device_uuid,
            is_deleted=False,
        )
        if db_device is None:
            raise NotFoundException("Device not found")
        if _status_is_unavailable(db_device.get("status")):
            raise ForbiddenException("Device is unavailable")

        now = _now_utc()
        session_internal.locked_at = now
        session_internal.expires_at = _normalize_requested_expiry(session_internal.expires_at, now)

        active_session = await _get_active_session_for_device(db=db, device_uuid=session_internal.device_uuid)
        if active_session is not None:
            if await _expire_session_if_needed(db=db, redis=redis, session=active_session):
                active_session = None

        if active_session is not None:
            active_user_uuid = active_session.get("user_uuid")
            if active_user_uuid is None or str(active_user_uuid) != str(session_internal.user_uuid):
                raise ForbiddenException("Device is busy")

            active_session_uuid_raw = active_session.get("uuid")
            if active_session_uuid_raw is None:
                raise ForbiddenException("Device is busy")

            active_session_uuid = _normalize_uuid(str(active_session_uuid_raw))
            active_expires_at = _cap_existing_expiry(active_session.get("expires_at"), active_session.get("created_at"), now)
            if active_expires_at <= now:
                await _expire_session(db=db, redis=redis, session=active_session)
            else:
                await crud_sessions.update(
                    db=db,
                    object=SessionUpdate(
                        connection_id=session_internal.connection_id,
                        locked_at=now,
                        expires_at=active_expires_at,
                    ),
                    uuid=active_session_uuid,
                )
                refreshed_session = await crud_sessions.get(db=db, uuid=active_session_uuid, schema_to_select=SessionRead)
                if refreshed_session is None:
                    raise NotFoundException("Session not found")

                await _ensure_device_lock(
                    redis=redis,
                    device_uuid=session_internal.device_uuid,
                    user_uuid=session_internal.user_uuid,
                    connection_id=session_internal.connection_id,
                    expires_at=active_expires_at,
                    session_uuid=active_session_uuid,
                    disconnected_at=None,
                )
                await _set_device_status(db=db, device_uuid=session_internal.device_uuid, status=DeviceStatus.BUSY)
                return refreshed_session

        lock_key = _device_session_key(session_internal.device_uuid)
        lock = _decode_device_lock(await redis.get(lock_key))
        if lock is not None:
            if _is_lock_disconnect_expired(lock, now):
                await redis.delete(lock_key)
                lock = None

        if lock is not None:
            if lock.get("user_uuid") is None:
                if lock.get("connection_id") != str(session_internal.connection_id):
                    raise ForbiddenException("Device is busy")
            elif lock.get("user_uuid") != str(session_internal.user_uuid):
                raise ForbiddenException("Device is busy")
            await redis.delete(lock_key)

        lock_acquired = await _acquire_device_lock(
            redis=redis,
            device_uuid=session_internal.device_uuid,
            user_uuid=session_internal.user_uuid,
            connection_id=session_internal.connection_id,
            expires_at=session_internal.expires_at,
            disconnected_at=None,
        )
        if not lock_acquired:
            raise ForbiddenException("Device is busy")

    try:
        created_session = await crud_sessions.create(db=db, object=session_internal, schema_to_select=SessionRead)
        if created_session is None:
            raise NotFoundException("Failed to create session")
    except Exception:
        if lock_acquired:
            await _release_device_lock(
                redis=redis,
                device_uuid=session_internal.device_uuid,
                user_uuid=session_internal.user_uuid,
                connection_id=session_internal.connection_id,
            )
        raise

    if session_internal.status == SessionStatus.ACTIVE:
        created_session_uuid = created_session.get("uuid") if isinstance(created_session, dict) else None
        await _ensure_device_lock(
            redis=redis,
            device_uuid=session_internal.device_uuid,
            user_uuid=session_internal.user_uuid,
            connection_id=session_internal.connection_id,
            expires_at=session_internal.expires_at,
            session_uuid=_normalize_uuid(str(created_session_uuid)) if created_session_uuid else None,
            disconnected_at=None,
        )
        await _set_device_status(db=db, device_uuid=session_internal.device_uuid, status=DeviceStatus.BUSY)

    return created_session


@router.get("/sessions", response_model=PaginatedListResponse[SessionRead])
async def read_sessions(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    page: int = 1,
    items_per_page: int = 10,
) -> dict:
    filters: dict[str, Any] = {"is_deleted": False}
    if not _is_teacher(current_user):
        filters["user_uuid"] = _normalize_uuid(current_user["uuid"])

    sessions_data = await crud_sessions.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        schema_to_select=SessionRead,
        **filters,
    )

    response: dict[str, Any] = paginated_response(crud_data=sessions_data, page=page, items_per_page=items_per_page)
    return response


@router.get("/session/{session_uuid}", response_model=SessionRead)
async def read_session(
    request: Request,
    session_uuid: uuid_pkg.UUID,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    filters: dict[str, Any] = {"uuid": session_uuid, "is_deleted": False}
    if not _is_teacher(current_user):
        filters["user_uuid"] = _normalize_uuid(current_user["uuid"])

    db_session = await crud_sessions.get(db=db, schema_to_select=SessionRead, **filters)
    if db_session is None:
        raise NotFoundException("Session not found")

    return db_session


@router.put("/session/{session_uuid}", response_model=SessionRead)
async def update_session(
    request: Request,
    values: SessionUpdate,
    session_uuid: uuid_pkg.UUID,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
) -> dict[str, Any]:
    filters: dict[str, Any] = {"uuid": session_uuid}
    if not _is_teacher(current_user):
        filters["user_uuid"] = _normalize_uuid(current_user["uuid"])

    db_session = await crud_sessions.get(db=db, **filters)
    if db_session is None:
        raise NotFoundException("Session not found")

    if not _is_teacher(current_user):
        if values.user_uuid is not None and values.user_uuid != filters["user_uuid"]:
            raise ForbiddenException()
        if values.device_uuid is not None and values.device_uuid != db_session.get("device_uuid"):
            raise ForbiddenException()

    await crud_sessions.update(db=db, object=values, uuid=session_uuid)
    updated_session = await crud_sessions.get(db=db, uuid=session_uuid, schema_to_select=SessionRead)

    if updated_session is None:
        raise NotFoundException("Session not found")

    if values.status in {SessionStatus.CLOSED, SessionStatus.EXPIRED}:
        device_uuid = db_session.get("device_uuid")
        connection_id = db_session.get("connection_id")
        user_uuid = db_session.get("user_uuid")
        if device_uuid is not None and connection_id is not None and user_uuid is not None:
            lock_released = await _release_device_lock(
                redis=redis,
                device_uuid=device_uuid,
                user_uuid=user_uuid,
                connection_id=connection_id,
            )
            if lock_released:
                await _set_device_status(db=db, device_uuid=device_uuid, status=DeviceStatus.AVAILABLE)

    return updated_session


@router.delete("/session/{session_uuid}")
async def erase_session(
    request: Request,
    session_uuid: uuid_pkg.UUID,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
) -> dict[str, str]:
    filters: dict[str, Any] = {"uuid": session_uuid}
    if not _is_teacher(current_user):
        filters["user_uuid"] = _normalize_uuid(current_user["uuid"])

    db_session = await crud_sessions.get(db=db, schema_to_select=SessionRead, **filters)
    if not db_session:
        raise NotFoundException("Session not found")

    await crud_sessions.delete(db=db, uuid=session_uuid)
    device_uuid = db_session.get("device_uuid")
    connection_id = db_session.get("connection_id")
    user_uuid = db_session.get("user_uuid")
    if device_uuid is not None and connection_id is not None and user_uuid is not None:
        lock_released = await _release_device_lock(
            redis=redis,
            device_uuid=device_uuid,
            user_uuid=user_uuid,
            connection_id=connection_id,
        )
        if lock_released:
            await _set_device_status(db=db, device_uuid=device_uuid, status=DeviceStatus.AVAILABLE)
    return {"message": "Session deleted"}

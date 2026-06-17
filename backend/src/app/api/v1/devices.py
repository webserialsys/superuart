import uuid as uuid_pkg
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from redis.asyncio import Redis
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import CurrentUser, get_current_user, require_roles
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from ...core.utils.cache import async_get_redis
from ...crud.crud_devices import crud_devices
from ...models.access import Access
from ...models.device import Device
from ...models.enums import DeviceStatus, SessionStatus, UserRole
from ...models.session import Session
from ...models.user import User
from ...schemas.device import (
    DeviceAvailabilityRead,
    DeviceCreateInternal,
    DeviceRead,
    DeviceTeacherCreate,
    DeviceTeacherUpdate,
    DeviceUpdate,
)
from .sessions import _device_session_key, _expire_session, _expire_session_if_needed, _get_active_session_for_device

router = APIRouter(tags=["devices"])


def _normalize_uuid(value: uuid_pkg.UUID | str) -> uuid_pkg.UUID:
    if isinstance(value, str):
        return uuid_pkg.UUID(value)
    return value


async def _build_occupancy(
    db: AsyncSession,
    redis: Redis,
    device_ids: list[uuid_pkg.UUID],
    current_user_uuid: uuid_pkg.UUID | None = None,
) -> tuple[dict[uuid_pkg.UUID, dict[str, Any]], set[uuid_pkg.UUID]]:
    if not device_ids:
        return {}, set()

    session_stmt = (
        select(Session, User.full_name)
        .join(User, User.uuid == Session.user_uuid)
        .where(
            Session.device_uuid.in_(device_ids),
            Session.status == SessionStatus.ACTIVE,
            Session.is_deleted.is_(False),
        )
        .order_by(Session.created_at.desc())
    )
    active_rows = (await db.execute(session_stmt)).all()

    occupied_by_device: dict[uuid_pkg.UUID, dict[str, Any]] = {}
    expired_device_ids: set[uuid_pkg.UUID] = set()

    for session_row, full_name in active_rows:
        session_data = {
            "uuid": session_row.uuid,
            "status": session_row.status,
            "connection_id": session_row.connection_id,
            "locked_at": session_row.locked_at,
            "expires_at": session_row.expires_at,
            "user_uuid": session_row.user_uuid,
            "device_uuid": session_row.device_uuid,
            "created_at": session_row.created_at,
            "updated_at": session_row.updated_at,
        }

        if await _expire_session_if_needed(db=db, redis=redis, session=session_data):
            expired_device_ids.add(session_row.device_uuid)
            continue

        if session_row.device_uuid in occupied_by_device:
            continue

        owned_by_current_user = current_user_uuid is not None and session_row.user_uuid == current_user_uuid
        occupied_by_device[session_row.device_uuid] = {
            "occupied_by_user_uuid": session_row.user_uuid,
            "occupied_by_label": "You" if owned_by_current_user else full_name,
            "occupied_by_you": owned_by_current_user,
            "active_session_uuid": session_row.uuid,
            "active_session_expires_at": session_row.expires_at,
        }

    return occupied_by_device, expired_device_ids


@router.post(
    "/device", response_model=DeviceRead, status_code=201, dependencies=[Depends(require_roles(UserRole.TEACHER))]
)
async def write_device(
    request: Request, device: DeviceTeacherCreate, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    port_row = await crud_devices.exists(db=db, port=device.port, host_uuid=device.host_uuid, is_deleted=False)
    if port_row:
        raise DuplicateValueException("Port is already registered for this host")

    device_internal = DeviceCreateInternal(
        **device.model_dump(),
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
    )
    created_device = await crud_devices.create(db=db, object=device_internal, schema_to_select=DeviceRead)

    if created_device is None:
        raise NotFoundException("Failed to create device")

    return created_device


@router.get(
    "/devices",
    response_model=PaginatedListResponse[DeviceAvailabilityRead],
    dependencies=[Depends(require_roles(UserRole.TEACHER))],
)
async def read_devices(
    request: Request,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
    page: int = 1,
    items_per_page: int = 10,
) -> dict[str, Any]:
    devices_data = await crud_devices.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        is_deleted=False,
        schema_to_select=DeviceRead,
    )

    response: dict[str, Any] = paginated_response(crud_data=devices_data, page=page, items_per_page=items_per_page)
    device_rows = response.get("data")
    if not isinstance(device_rows, list) or not device_rows:
        return response

    device_ids: list[uuid_pkg.UUID] = []
    for row in device_rows:
        if not isinstance(row, dict):
            continue
        raw_uuid = row.get("uuid")
        if raw_uuid is None:
            continue
        device_ids.append(_normalize_uuid(raw_uuid))

    current_user_uuid = current_user["uuid"]
    if isinstance(current_user_uuid, str):
        current_user_uuid = _normalize_uuid(current_user_uuid)

    occupied_by_device, expired_device_ids = await _build_occupancy(
        db=db,
        redis=redis,
        device_ids=device_ids,
        current_user_uuid=current_user_uuid,
    )

    for row in device_rows:
        if not isinstance(row, dict):
            continue
        raw_uuid = row.get("uuid")
        if raw_uuid is None:
            continue
        device_uuid = _normalize_uuid(raw_uuid)
        occupied_payload = occupied_by_device.get(device_uuid)
        current_status = row.get("status")
        is_unavailable = current_status in {DeviceStatus.UNAVAILABLE, DeviceStatus.UNAVAILABLE.value}

        if not is_unavailable:
            if occupied_payload is not None:
                row["status"] = DeviceStatus.BUSY
            elif device_uuid in expired_device_ids:
                row["status"] = DeviceStatus.AVAILABLE

        row["occupied_by_user_uuid"] = occupied_payload["occupied_by_user_uuid"] if occupied_payload else None
        row["occupied_by_label"] = occupied_payload["occupied_by_label"] if occupied_payload else None
        row["occupied_by_you"] = occupied_payload["occupied_by_you"] if occupied_payload else False
        row["active_session_uuid"] = occupied_payload["active_session_uuid"] if occupied_payload else None
        row["active_session_expires_at"] = occupied_payload["active_session_expires_at"] if occupied_payload else None

    return response


@router.get("/devices/available", response_model=list[DeviceAvailabilityRead])
async def read_available_devices(
    request: Request,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
) -> list[DeviceAvailabilityRead]:
    now = datetime.now(UTC)
    user_uuid = current_user["uuid"]
    if isinstance(user_uuid, str):
        user_uuid = _normalize_uuid(user_uuid)
    stmt = (
        select(Device)
        .join(Access, Access.device_uuid == Device.uuid)
        .where(
            Access.user_uuid == user_uuid,
            Device.status.in_([DeviceStatus.AVAILABLE, DeviceStatus.BUSY]),
            Device.is_deleted.is_(False),
            or_(Access.expires_at.is_(None), Access.expires_at > now),
        )
    )
    devices = (await db.execute(stmt)).scalars().all()

    if not devices:
        return []

    device_ids = [device.uuid for device in devices]
    occupied_by_device, expired_device_ids = await _build_occupancy(
        db=db,
        redis=redis,
        device_ids=device_ids,
        current_user_uuid=user_uuid,
    )

    response: list[DeviceAvailabilityRead] = []
    for device in devices:
        payload = DeviceRead.model_validate(device, from_attributes=True).model_dump()
        occupied_payload = occupied_by_device.get(device.uuid)

        status = payload["status"]
        if occupied_payload is not None:
            status = DeviceStatus.BUSY
        elif device.uuid in expired_device_ids:
            status = DeviceStatus.AVAILABLE
        payload["status"] = status

        response.append(
            DeviceAvailabilityRead(
                **payload,
                occupied_by_user_uuid=occupied_payload["occupied_by_user_uuid"] if occupied_payload else None,
                occupied_by_label=occupied_payload["occupied_by_label"] if occupied_payload else None,
                occupied_by_you=occupied_payload["occupied_by_you"] if occupied_payload else False,
                active_session_uuid=occupied_payload["active_session_uuid"] if occupied_payload else None,
                active_session_expires_at=occupied_payload["active_session_expires_at"] if occupied_payload else None,
            )
        )

    return response


@router.get("/device/{device_uuid}", response_model=DeviceRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_device(
    request: Request, device_uuid: uuid_pkg.UUID, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    db_device = await crud_devices.get(db=db, uuid=device_uuid, is_deleted=False, schema_to_select=DeviceRead)
    if db_device is None:
        raise NotFoundException("Device not found")

    return db_device


@router.put("/device/{device_uuid}", response_model=DeviceRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def update_device(
    request: Request,
    values: DeviceTeacherUpdate,
    device_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
    redis: Annotated[Redis, Depends(async_get_redis)],
) -> dict[str, Any]:
    db_device = await crud_devices.get(db=db, uuid=device_uuid)
    if db_device is None:
        raise NotFoundException("Device not found")

    current_port = db_device.get("port")
    current_host_uuid = db_device.get("host_uuid")
    next_port = values.port if values.port is not None else current_port
    next_host_uuid = values.host_uuid if values.host_uuid is not None else current_host_uuid

    if next_port != current_port or next_host_uuid != current_host_uuid:
        if await crud_devices.exists(db=db, port=next_port, host_uuid=next_host_uuid, is_deleted=False):
            raise DuplicateValueException("Port is already registered for this host")

    update_payload = values.model_dump(exclude_none=True)
    is_enabled = update_payload.pop("is_enabled", None)
    if is_enabled is not None:
        update_payload["status"] = DeviceStatus.AVAILABLE if is_enabled else DeviceStatus.UNAVAILABLE
        if not is_enabled:
            active_session = await _get_active_session_for_device(db=db, device_uuid=device_uuid)
            if active_session is not None:
                await _expire_session(db=db, redis=redis, session=active_session)
            await redis.delete(_device_session_key(device_uuid))

    await crud_devices.update(db=db, object=DeviceUpdate(**update_payload), uuid=device_uuid)
    updated_device = await crud_devices.get(db=db, uuid=device_uuid, schema_to_select=DeviceRead)

    if updated_device is None:
        raise NotFoundException("Device not found")

    return updated_device


@router.delete("/device/{device_uuid}", dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def erase_device(
    request: Request,
    device_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_device = await crud_devices.get(db=db, uuid=device_uuid, schema_to_select=DeviceRead)
    if not db_device:
        raise NotFoundException("Device not found")

    await crud_devices.delete(db=db, uuid=device_uuid)
    return {"message": "Device deleted"}

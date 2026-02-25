import uuid as uuid_pkg
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user, require_roles
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from ...crud.crud_devices import crud_devices
from ...models.access import Access
from ...models.device import Device
from ...models.enums import DeviceStatus, UserRole
from ...schemas.device import DeviceCreate, DeviceCreateInternal, DeviceRead, DeviceUpdate

router = APIRouter(tags=["devices"])


@router.post("/device", response_model=DeviceRead, status_code=201, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def write_device(
    request: Request, device: DeviceCreate, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    port_row = await crud_devices.exists(db=db, port=device.port, host_uuid=device.host_uuid, is_deleted=False)
    if port_row:
        raise DuplicateValueException("Port is already registered for this host")

    device_internal = DeviceCreateInternal(**device.model_dump())
    created_device = await crud_devices.create(db=db, object=device_internal, schema_to_select=DeviceRead)

    if created_device is None:
        raise NotFoundException("Failed to create device")

    return created_device


@router.get("/devices", response_model=PaginatedListResponse[DeviceRead], dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_devices(
    request: Request,
    db: Annotated[AsyncSession, Depends(async_get_db)],
    page: int = 1,
    items_per_page: int = 10,
) -> dict:
    devices_data = await crud_devices.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        is_deleted=False,
        schema_to_select=DeviceRead,
    )

    response: dict[str, Any] = paginated_response(crud_data=devices_data, page=page, items_per_page=items_per_page)
    return response


@router.get("/devices/available", response_model=list[DeviceRead])
async def read_available_devices(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> list[DeviceRead]:
    now = datetime.now(UTC)
    user_uuid = current_user["uuid"]
    if isinstance(user_uuid, str):
        user_uuid = uuid_pkg.UUID(user_uuid)
    stmt = (
        select(Device)
        .join(Access, Access.device_uuid == Device.uuid)
        .where(
            Access.user_uuid == user_uuid,
            Device.status == DeviceStatus.AVAILABLE,
            Device.is_deleted.is_(False),
            or_(Access.expires_at.is_(None), Access.expires_at > now),
        )
    )
    devices = (await db.execute(stmt)).scalars().all()
    return [DeviceRead.model_validate(device, from_attributes=True) for device in devices]


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
    values: DeviceUpdate,
    device_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
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

    await crud_devices.update(db=db, object=values, uuid=device_uuid)
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

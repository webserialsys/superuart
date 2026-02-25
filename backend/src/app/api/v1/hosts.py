import secrets
import uuid as uuid_pkg
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import require_roles
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from ...core.security import get_password_hash
from ...crud.crud_hosts import crud_hosts
from ...models.enums import UserRole
from ...schemas.host import HostCreate, HostCreateInternal, HostCreateResponse, HostRead, HostUpdate

router = APIRouter(tags=["hosts"])


@router.post("/host", response_model=HostCreateResponse, status_code=201)
async def write_host(
    request: Request,
    host: HostCreate,
    current_user: Annotated[dict, Depends(require_roles(UserRole.TEACHER))],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    if await crud_hosts.exists(db=db, name=host.name, is_deleted=False):
        raise DuplicateValueException("Host name is already registered")

    api_key = secrets.token_urlsafe(32)
    api_key_hash = get_password_hash(api_key)

    user_uuid = current_user.get("uuid")
    if isinstance(user_uuid, str):
        user_uuid = uuid_pkg.UUID(user_uuid)

    host_internal = HostCreateInternal(**host.model_dump(), api_key_hash=api_key_hash, user_uuid=user_uuid)
    created_host = await crud_hosts.create(db=db, object=host_internal, schema_to_select=HostRead)

    if created_host is None:
        raise NotFoundException("Failed to create host")

    return {"host": created_host, "api_key": api_key}


@router.get("/hosts", response_model=PaginatedListResponse[HostRead], dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_hosts(
    request: Request, db: Annotated[AsyncSession, Depends(async_get_db)], page: int = 1, items_per_page: int = 10
) -> dict:
    hosts_data = await crud_hosts.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        is_deleted=False,
        schema_to_select=HostRead,
    )

    response: dict[str, Any] = paginated_response(crud_data=hosts_data, page=page, items_per_page=items_per_page)
    return response


@router.get("/host/{host_uuid}", response_model=HostRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_host(
    request: Request, host_uuid: uuid_pkg.UUID, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    db_host = await crud_hosts.get(db=db, uuid=host_uuid, is_deleted=False, schema_to_select=HostRead)
    if db_host is None:
        raise NotFoundException("Host not found")

    return db_host


@router.put("/host/{host_uuid}", response_model=HostRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def update_host(
    request: Request,
    values: HostUpdate,
    host_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    db_host = await crud_hosts.get(db=db, uuid=host_uuid)
    if db_host is None:
        raise NotFoundException("Host not found")

    if values.name is not None and values.name != db_host.get("name"):
        if await crud_hosts.exists(db=db, name=values.name, is_deleted=False):
            raise DuplicateValueException("Host name is already registered")

    await crud_hosts.update(db=db, object=values, uuid=host_uuid)
    updated_host = await crud_hosts.get(db=db, uuid=host_uuid, schema_to_select=HostRead)

    if updated_host is None:
        raise NotFoundException("Host not found")

    return updated_host


@router.delete("/host/{host_uuid}", dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def erase_host(
    request: Request,
    host_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_host = await crud_hosts.get(db=db, uuid=host_uuid, schema_to_select=HostRead)
    if not db_host:
        raise NotFoundException("Host not found")

    await crud_hosts.delete(db=db, uuid=host_uuid)
    return {"message": "Host deleted"}

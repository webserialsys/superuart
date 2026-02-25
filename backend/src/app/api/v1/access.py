import uuid as uuid_pkg
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import require_roles
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from ...crud.crud_access import crud_access
from ...models.enums import UserRole
from ...schemas.access import AccessCreate, AccessCreateInternal, AccessRead, AccessUpdate

router = APIRouter(tags=["access"])


@router.post("/access", response_model=AccessRead, status_code=201, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def write_access(
    request: Request, access: AccessCreate, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    if await crud_access.exists(db=db, device_uuid=access.device_uuid):
        raise DuplicateValueException("Device already has access assigned")

    access_internal = AccessCreateInternal(**access.model_dump())
    created_access = await crud_access.create(db=db, object=access_internal, schema_to_select=AccessRead)

    if created_access is None:
        raise NotFoundException("Failed to create access")

    return created_access


@router.get("/accesses", response_model=PaginatedListResponse[AccessRead], dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_accesses(
    request: Request, db: Annotated[AsyncSession, Depends(async_get_db)], page: int = 1, items_per_page: int = 10
) -> dict:
    accesses_data = await crud_access.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        schema_to_select=AccessRead,
    )

    response: dict[str, Any] = paginated_response(crud_data=accesses_data, page=page, items_per_page=items_per_page)
    return response


@router.get("/access/{access_uuid}", response_model=AccessRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def read_access(
    request: Request, access_uuid: uuid_pkg.UUID, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    db_access = await crud_access.get(db=db, uuid=access_uuid, schema_to_select=AccessRead)
    if db_access is None:
        raise NotFoundException("Access not found")

    return db_access


@router.patch("/access/{access_uuid}", response_model=AccessRead, dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def update_access(
    request: Request,
    values: AccessUpdate,
    access_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    db_access = await crud_access.get(db=db, uuid=access_uuid)
    if db_access is None:
        raise NotFoundException("Access not found")

    await crud_access.update(db=db, object=values, uuid=access_uuid)
    updated_access = await crud_access.get(db=db, uuid=access_uuid, schema_to_select=AccessRead)

    if updated_access is None:
        raise NotFoundException("Access not found")

    return updated_access


@router.delete("/access/{access_uuid}", dependencies=[Depends(require_roles(UserRole.TEACHER))])
async def erase_access(
    request: Request,
    access_uuid: uuid_pkg.UUID,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_access = await crud_access.get(db=db, uuid=access_uuid, schema_to_select=AccessRead)
    if not db_access:
        raise NotFoundException("Access not found")

    await crud_access.db_delete(db=db, uuid=access_uuid)
    return {"message": "Access deleted"}

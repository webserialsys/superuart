import uuid as uuid_pkg
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import ForbiddenException, NotFoundException
from ...crud.crud_sessions import crud_sessions
from ...models.enums import UserRole
from ...schemas.session import SessionCreate, SessionCreateInternal, SessionRead, SessionUpdate

router = APIRouter(tags=["sessions"])


def _is_teacher(user: dict) -> bool:
    role = user.get("role")
    return role in {UserRole.TEACHER, UserRole.TEACHER.value}


def _normalize_uuid(value: uuid_pkg.UUID | str) -> uuid_pkg.UUID:
    if isinstance(value, uuid_pkg.UUID):
        return value
    return uuid_pkg.UUID(value)


@router.post("/session", response_model=SessionRead, status_code=201)
async def write_session(
    request: Request,
    session: SessionCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    session_payload = session.model_dump()
    if not _is_teacher(current_user):
        session_payload["user_uuid"] = _normalize_uuid(current_user["uuid"])

    session_internal = SessionCreateInternal(**session_payload)
    created_session = await crud_sessions.create(db=db, object=session_internal, schema_to_select=SessionRead)

    if created_session is None:
        raise NotFoundException("Failed to create session")

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

    return updated_session


@router.delete("/session/{session_uuid}")
async def erase_session(
    request: Request,
    session_uuid: uuid_pkg.UUID,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    filters: dict[str, Any] = {"uuid": session_uuid}
    if not _is_teacher(current_user):
        filters["user_uuid"] = _normalize_uuid(current_user["uuid"])

    db_session = await crud_sessions.get(db=db, schema_to_select=SessionRead, **filters)
    if not db_session:
        raise NotFoundException("Session not found")

    await crud_sessions.delete(db=db, uuid=session_uuid)
    return {"message": "Session deleted"}

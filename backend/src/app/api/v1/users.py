from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastcrud import PaginatedListResponse, compute_offset, paginated_response
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import CurrentUser, get_current_superuser, get_current_user, require_roles
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import DuplicateValueException, ForbiddenException, NotFoundException
from ...core.security import get_password_hash
from ...crud.crud_users import crud_users
from ...models.enums import UserRole
from ...schemas.user import UserCreate, UserCreateInternal, UserRead, UserUpdate

router = APIRouter(tags=["users"])


@router.post("/user", response_model=UserRead, status_code=201)
async def write_user(
    request: Request, user: UserCreate, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> dict[str, Any]:
    email_row = await crud_users.exists(db=db, email=user.email)
    if email_row:
        raise DuplicateValueException("Email is already registered")

    user_internal_dict = user.model_dump()
    user_internal_dict["hashed_password"] = get_password_hash(password=user_internal_dict["password"])
    del user_internal_dict["password"]

    user_internal = UserCreateInternal(**user_internal_dict)
    created_user = await crud_users.create(db=db, object=user_internal, schema_to_select=UserRead)

    if created_user is None:
        raise NotFoundException("Failed to create user")

    return created_user


@router.get(
    "/users",
    response_model=PaginatedListResponse[UserRead],
    dependencies=[Depends(require_roles(UserRole.TEACHER))],
)
async def read_users(
    request: Request, db: Annotated[AsyncSession, Depends(async_get_db)], page: int = 1, items_per_page: int = 10
) -> dict[str, Any]:
    users_data = await crud_users.get_multi(
        db=db,
        offset=compute_offset(page, items_per_page),
        limit=items_per_page,
        is_deleted=False,
        schema_to_select=UserRead,
    )

    response: dict[str, Any] = paginated_response(crud_data=users_data, page=page, items_per_page=items_per_page)
    return response


@router.get("/user/me/", response_model=UserRead)
async def read_users_me(request: Request, current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    return current_user


@router.get("/user/{email}", response_model=UserRead)
async def read_user(
    request: Request,
    email: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, Any]:
    role = current_user.get("role")
    is_teacher = role == UserRole.TEACHER or role == UserRole.TEACHER.value
    if not current_user.get("is_superuser", False) and not is_teacher and current_user.get("email") != email:
        raise ForbiddenException()

    db_user = await crud_users.get(db=db, email=email, is_deleted=False, schema_to_select=UserRead)
    if db_user is None:
        raise NotFoundException("User not found")

    return db_user


@router.patch("/user/{email}")
async def patch_user(
    request: Request,
    values: UserUpdate,
    email: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_user = await crud_users.get(db=db, email=email)
    if db_user is None:
        raise NotFoundException("User not found")

    db_email = db_user["email"]

    if db_email != current_user["email"]:
        raise ForbiddenException()

    if values.email is not None and values.email != db_email:
        if await crud_users.exists(db=db, email=values.email):
            raise DuplicateValueException("Email is already registered")

    await crud_users.update(db=db, object=values, email=email)
    return {"message": "User updated"}


@router.delete("/user/{email}")
async def erase_user(
    request: Request,
    email: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_user = await crud_users.get(db=db, email=email, schema_to_select=UserRead)
    if not db_user:
        raise NotFoundException("User not found")

    if email != current_user["email"]:
        raise ForbiddenException()

    await crud_users.delete(db=db, email=email)
    return {"message": "User deleted"}


@router.delete("/db_user/{email}", dependencies=[Depends(get_current_superuser)])
async def erase_db_user(
    request: Request,
    email: str,
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> dict[str, str]:
    db_user = await crud_users.exists(db=db, email=email)
    if not db_user:
        raise NotFoundException("User not found")

    await crud_users.db_delete(db=db, email=email)
    return {"message": "User deleted from the database"}

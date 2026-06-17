from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.db.database import async_get_db
from ..core.exceptions.http_exceptions import ForbiddenException, UnauthorizedException
from ..core.logger import logging
from ..core.security import TokenType, oauth2_scheme, verify_token
from ..crud.crud_users import crud_users
from ..models.enums import UserRole

logger = logging.getLogger(__name__)
CurrentUser = dict[str, Any]


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[AsyncSession, Depends(async_get_db)]
) -> CurrentUser:
    token_data = await verify_token(token, TokenType.ACCESS)
    if token_data is None:
        raise UnauthorizedException("User not authenticated.")

    user = await crud_users.get(db=db, email=token_data.email, is_deleted=False)

    if user:
        return user

    raise UnauthorizedException("User not authenticated.")


async def get_optional_user(
    request: Request, db: Annotated[AsyncSession, Depends(async_get_db)]
) -> CurrentUser | None:
    token = request.headers.get("Authorization")
    if not token:
        return None

    try:
        token_type, _, token_value = token.partition(" ")
        if token_type.lower() != "bearer" or not token_value:
            return None

        token_data = await verify_token(token_value, TokenType.ACCESS)
        if token_data is None:
            return None

        return await get_current_user(token_value, db=db)

    except HTTPException as http_exc:
        if http_exc.status_code != 401:
            logger.error(f"Unexpected HTTPException in get_optional_user: {http_exc.detail}")
        return None

    except Exception as exc:
        logger.error(f"Unexpected error in get_optional_user: {exc}")
        return None


async def get_current_superuser(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if current_user.get("is_superuser", False):
        return current_user
    raise ForbiddenException("You do not have enough privileges.")


def require_roles(*roles: UserRole) -> Callable[[CurrentUser], Awaitable[CurrentUser]]:
    role_values = {role.value for role in roles}

    async def _require(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        role = current_user.get("role")
        if current_user.get("is_superuser", False):
            return current_user

        if role in role_values or role in roles:
            return current_user

        raise ForbiddenException("You do not have enough privileges.")

    return _require

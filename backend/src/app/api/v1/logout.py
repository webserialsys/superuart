from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response

from ...core.exceptions.http_exceptions import UnauthorizedException
from ...core.security import oauth2_scheme

router = APIRouter(tags=["login"])


@router.post("/logout")
async def logout(
    response: Response,
    access_token: Annotated[str, Depends(oauth2_scheme)],
    refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> dict[str, str]:
    if not refresh_token:
        raise UnauthorizedException("Refresh token not found")

    response.delete_cookie(key="refresh_token")

    return {"message": "Logged out successfully"}

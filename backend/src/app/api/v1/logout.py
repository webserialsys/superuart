from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Response

from ...core.exceptions.http_exceptions import UnauthorizedException
from ...core.security import oauth2_scheme

router = APIRouter(tags=["login"])


@router.post("/logout")
async def logout(
    response: Response,
    access_token: str = Depends(oauth2_scheme),
    refresh_token: Optional[str] = Cookie(None, alias="refresh_token"),
) -> dict[str, str]:
    if not refresh_token:
        raise UnauthorizedException("Refresh token not found")

    response.delete_cookie(key="refresh_token")

    return {"message": "Logged out successfully"}

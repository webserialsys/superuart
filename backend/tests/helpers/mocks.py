import secrets
from typing import Any

from fastapi.encoders import jsonable_encoder

from src.app import models


def get_current_user(user: models.User) -> dict[str, Any]:
    return jsonable_encoder(user)


def oauth2_scheme() -> str:
    return secrets.token_hex(32)

"""Unit tests for token helpers."""

from unittest.mock import patch

import pytest
from jose import JWTError

from src.app.core.security import TokenType, verify_token


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_returns_token_data():
    token = "token-123"
    email = "user@example.com"

    with patch(
        "src.app.core.security.jwt.decode",
        return_value={"sub": email, "token_type": TokenType.ACCESS},
    ):
        result = await verify_token(token=token, expected_token_type=TokenType.ACCESS)

    assert result is not None
    assert result.email == email


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_wrong_type():
    token = "token-123"

    with patch(
        "src.app.core.security.jwt.decode",
        return_value={"sub": "user@example.com", "token_type": TokenType.REFRESH},
    ):
        result = await verify_token(token=token, expected_token_type=TokenType.ACCESS)

    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_jwt_error_returns_none():
    token = "token-123"

    with patch("src.app.core.security.jwt.decode", side_effect=JWTError):
        result = await verify_token(token=token, expected_token_type=TokenType.ACCESS)

    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_missing_email_returns_none():
    token = "token-123"

    with patch(
        "src.app.core.security.jwt.decode",
        return_value={"token_type": TokenType.ACCESS},
    ):
        result = await verify_token(token=token, expected_token_type=TokenType.ACCESS)

    assert result is None

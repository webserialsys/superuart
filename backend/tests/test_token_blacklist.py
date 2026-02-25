"""Unit tests for token blacklist helpers."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from jose import JWTError

from src.app.core.security import TokenType, blacklist_token, verify_token


@pytest.mark.asyncio
@pytest.mark.unit
async def test_blacklist_token_creates_entry(mock_db):
    token = "token-123"
    exp = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())

    with patch("src.app.core.security.jwt.decode", return_value={"exp": exp}):
        with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
            mock_crud.create = AsyncMock(return_value=None)

            await blacklist_token(token=token, db=mock_db)

    assert mock_crud.create.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_blacklist_token_no_exp_does_not_create(mock_db):
    token = "token-123"

    with patch("src.app.core.security.jwt.decode", return_value={}):
        with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
            mock_crud.create = AsyncMock(return_value=None)

            await blacklist_token(token=token, db=mock_db)

    assert not mock_crud.create.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_returns_none_when_blacklisted(mock_db):
    token = "token-123"

    with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=True)

        result = await verify_token(token=token, expected_token_type=TokenType.ACCESS, db=mock_db)

    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_returns_token_data(mock_db):
    token = "token-123"
    email = "user@example.com"

    with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)

        with patch(
            "src.app.core.security.jwt.decode",
            return_value={"sub": email, "token_type": TokenType.ACCESS},
        ):
            result = await verify_token(token=token, expected_token_type=TokenType.ACCESS, db=mock_db)

    assert result is not None
    assert result.email == email


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_wrong_type(mock_db):
    token = "token-123"

    with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)

        with patch(
            "src.app.core.security.jwt.decode",
            return_value={"sub": "user@example.com", "token_type": TokenType.REFRESH},
        ):
            result = await verify_token(token=token, expected_token_type=TokenType.ACCESS, db=mock_db)

    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_jwt_error_returns_none(mock_db):
    token = "token-123"

    with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)

        with patch("src.app.core.security.jwt.decode", side_effect=JWTError):
            result = await verify_token(token=token, expected_token_type=TokenType.ACCESS, db=mock_db)

    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_verify_token_missing_email_returns_none(mock_db):
    token = "token-123"

    with patch("src.app.core.security.crud_token_blacklist") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)

        with patch(
            "src.app.core.security.jwt.decode",
            return_value={"token_type": TokenType.ACCESS},
        ):
            result = await verify_token(token=token, expected_token_type=TokenType.ACCESS, db=mock_db)

    assert result is None

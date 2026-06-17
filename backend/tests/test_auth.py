"""Unit tests for authentication API and dependencies."""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import Response

from src.app.api.dependencies import get_current_user, require_roles
from src.app.api.v1.login import login_for_access_token, refresh_access_token
from src.app.core.exceptions.http_exceptions import ForbiddenException, UnauthorizedException
from src.app.core.schemas import TokenData
from src.app.models.enums import UserRole


class TestLoginForAccessToken:
    """Test login endpoint."""

    @pytest.mark.asyncio
    async def test_login_success(self, mock_db):
        """Return access token and set refresh cookie for valid credentials."""
        form_data = Mock(username="user@example.com", password="secret")
        response = Response()

        with patch("src.app.api.v1.login.authenticate_user", new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = {"email": "user@example.com"}

            with patch("src.app.api.v1.login.create_access_token", new_callable=AsyncMock) as mock_create_access:
                mock_create_access.return_value = "access-token"

                with patch("src.app.api.v1.login.create_refresh_token", new_callable=AsyncMock) as mock_create_refresh:
                    mock_create_refresh.return_value = "refresh-token"

                    result = await login_for_access_token(response, form_data, mock_db)

        assert result == {"access_token": "access-token", "token_type": "bearer"}
        assert "refresh_token=refresh-token" in response.headers.get("set-cookie", "")
        mock_auth.assert_called_once_with(email="user@example.com", password="secret", db=mock_db)
        mock_create_access.assert_called_once()
        assert mock_create_access.call_args.kwargs["data"] == {"sub": "user@example.com"}
        mock_create_refresh.assert_called_once_with(data={"sub": "user@example.com"})

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, mock_db):
        """Raise UnauthorizedException for invalid credentials."""
        form_data = Mock(username="user@example.com", password="wrong-password")
        response = Response()

        with patch("src.app.api.v1.login.authenticate_user", new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = False

            with pytest.raises(UnauthorizedException, match="Wrong email or password."):
                await login_for_access_token(response, form_data, mock_db)


class TestRefreshAccessToken:
    """Test refresh endpoint."""

    @pytest.mark.asyncio
    async def test_refresh_missing_cookie(self, mock_db):
        """Raise UnauthorizedException when refresh cookie is missing."""
        request = Mock(cookies={})

        with pytest.raises(UnauthorizedException, match="Refresh token missing."):
            await refresh_access_token(request)

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, mock_db):
        """Raise UnauthorizedException when refresh token is invalid."""
        request = Mock(cookies={"refresh_token": "invalid-token"})

        with patch("src.app.api.v1.login.verify_token", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = None

            with pytest.raises(UnauthorizedException, match="Invalid refresh token."):
                await refresh_access_token(request)

    @pytest.mark.asyncio
    async def test_refresh_success(self, mock_db):
        """Issue a new access token for a valid refresh token."""
        request = Mock(cookies={"refresh_token": "refresh-token"})

        with patch("src.app.api.v1.login.verify_token", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = TokenData(email="user@example.com")

            with patch("src.app.api.v1.login.create_access_token", new_callable=AsyncMock) as mock_create_access:
                mock_create_access.return_value = "new-access-token"

                result = await refresh_access_token(request)

        assert result == {"access_token": "new-access-token", "token_type": "bearer"}
        mock_verify.assert_called_once()
        mock_create_access.assert_called_once_with(data={"sub": "user@example.com"})


class TestGetCurrentUser:
    """Test current-user dependency."""

    @pytest.mark.asyncio
    async def test_get_current_user_success(self, mock_db):
        """Load a user by email from access token subject."""
        token = "access-token"
        expected_user = {"email": "user@example.com"}

        with patch("src.app.api.dependencies.verify_token", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = TokenData(email="user@example.com")

            with patch("src.app.api.dependencies.crud_users") as mock_crud:
                mock_crud.get = AsyncMock(return_value=expected_user)

                result = await get_current_user(token, mock_db)

        assert result == expected_user
        mock_crud.get.assert_called_once_with(db=mock_db, email="user@example.com", is_deleted=False)

    @pytest.mark.asyncio
    async def test_get_current_user_unauthorized(self, mock_db):
        """Raise UnauthorizedException when token or user is invalid."""
        token = "access-token"

        with patch("src.app.api.dependencies.verify_token", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = None

            with pytest.raises(UnauthorizedException, match="User not authenticated."):
                await get_current_user(token, mock_db)

    @pytest.mark.asyncio
    async def test_get_current_user_missing_user(self, mock_db):
        """Raise UnauthorizedException when user does not exist."""
        token = "access-token"

        with patch("src.app.api.dependencies.verify_token", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = TokenData(email="user@example.com")

            with patch("src.app.api.dependencies.crud_users") as mock_crud:
                mock_crud.get = AsyncMock(return_value=None)

                with pytest.raises(UnauthorizedException, match="User not authenticated."):
                    await get_current_user(token, mock_db)


class TestRequireRoles:
    """Test require_roles dependency helper."""

    @pytest.mark.asyncio
    async def test_require_roles_allows_teacher(self):
        checker = require_roles(UserRole.TEACHER)
        current_user = {"role": UserRole.TEACHER}

        result = await checker(current_user)
        assert result == current_user

    @pytest.mark.asyncio
    async def test_require_roles_allows_superuser(self):
        checker = require_roles(UserRole.TEACHER)
        current_user = {"role": UserRole.STUDENT, "is_superuser": True}

        result = await checker(current_user)
        assert result == current_user

    @pytest.mark.asyncio
    async def test_require_roles_forbids_student(self):
        checker = require_roles(UserRole.TEACHER)
        current_user = {"role": UserRole.STUDENT}

        with pytest.raises(ForbiddenException):
            await checker(current_user)

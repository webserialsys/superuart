"""Unit tests for access API endpoints."""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from uuid6 import uuid7

from src.app.api.v1.access import erase_access, read_access, read_accesses, update_access, write_access
from src.app.core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from src.app.schemas.access import AccessCreate, AccessRead, AccessUpdate


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_access_success(mock_db):
    access_create = AccessCreate(user_uuid=uuid7(), device_uuid=uuid7(), expires_at=None)
    access_read = AccessRead(
        uuid=uuid7(),
        user_uuid=access_create.user_uuid,
        device_uuid=access_create.device_uuid,
        expires_at=None,
    ).model_dump()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=access_read)

        result = await write_access(Mock(), access_create, mock_db)

    assert result == access_read


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_access_duplicate_device(mock_db):
    access_create = AccessCreate(user_uuid=uuid7(), device_uuid=uuid7(), expires_at=None)

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Device already has access assigned"):
            await write_access(Mock(), access_create, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_access_create_failed(mock_db):
    access_create = AccessCreate(user_uuid=uuid7(), device_uuid=uuid7(), expires_at=None)

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Failed to create access"):
            await write_access(Mock(), access_create, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_accesses_success(mock_db):
    accesses_data = {"data": [{"uuid": str(uuid7())}], "count": 1}
    expected_response = {"data": accesses_data["data"], "pagination": {}}

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=accesses_data)

        with patch("src.app.api.v1.access.paginated_response", return_value=expected_response):
            result = await read_accesses(Mock(), mock_db, page=1, items_per_page=10)

    assert result == expected_response


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_accesses_passes_pagination_params(mock_db):
    accesses_data = {"data": [], "count": 0}
    expected_response = {"data": [], "pagination": {}}

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=accesses_data)

        with patch("src.app.api.v1.access.paginated_response", return_value=expected_response):
            result = await read_accesses(Mock(), mock_db, page=2, items_per_page=5)

    assert result == expected_response
    get_multi_kwargs = mock_crud.get_multi.call_args.kwargs
    assert get_multi_kwargs["offset"] == 5
    assert get_multi_kwargs["limit"] == 5


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_access_success(mock_db):
    access_uuid = uuid7()
    access_read = AccessRead(
        uuid=access_uuid,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
        expires_at=None,
    ).model_dump()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(return_value=access_read)

        result = await read_access(Mock(), access_uuid, mock_db)

    assert result == access_read


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_access_not_found(mock_db):
    access_uuid = uuid7()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Access not found"):
            await read_access(Mock(), access_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_access_success(mock_db):
    access_uuid = uuid7()
    access_update = AccessUpdate(expires_at=None)
    db_access = {"uuid": access_uuid}
    updated_access = AccessRead(
        uuid=access_uuid,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
        expires_at=None,
    ).model_dump()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(side_effect=[db_access, updated_access])
        mock_crud.update = AsyncMock(return_value=None)

        result = await update_access(Mock(), access_update, access_uuid, mock_db)

    assert result == updated_access


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_access_not_found(mock_db):
    access_uuid = uuid7()
    access_update = AccessUpdate(expires_at=None)

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Access not found"):
            await update_access(Mock(), access_update, access_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_access_success(mock_db):
    access_uuid = uuid7()
    access_read = AccessRead(
        uuid=access_uuid,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
        expires_at=None,
    ).model_dump()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(return_value=access_read)
        mock_crud.db_delete = AsyncMock(return_value=None)

        result = await erase_access(Mock(), access_uuid, mock_db)

    assert result == {"message": "Access deleted"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_access_not_found(mock_db):
    access_uuid = uuid7()

    with patch("src.app.api.v1.access.crud_access") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Access not found"):
            await erase_access(Mock(), access_uuid, mock_db)

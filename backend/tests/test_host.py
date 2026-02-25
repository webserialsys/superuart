"""Unit tests for host API endpoints."""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from uuid6 import uuid7

from src.app.api.v1.hosts import erase_host, read_host, read_hosts, update_host, write_host
from src.app.core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from src.app.models.enums import HostStatus, UserRole
from src.app.schemas.host import HostCreate, HostRead, HostUpdate


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_host_success(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    host_create = HostCreate(name="host-01", status=HostStatus.OFFLINE)
    host_read = HostRead(
        uuid=uuid7(),
        name=host_create.name,
        status=HostStatus.OFFLINE,
        user_uuid=current_user["uuid"],
    ).model_dump()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=host_read)

        with patch("src.app.api.v1.hosts.secrets.token_urlsafe", return_value="api-key"):
            with patch("src.app.api.v1.hosts.get_password_hash", return_value="hashed_key"):
                result = await write_host(Mock(), host_create, current_user, mock_db)

    assert result == {"host": host_read, "api_key": "api-key"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_host_duplicate_name(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    host_create = HostCreate(name="host-01", status=HostStatus.OFFLINE)

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Host name is already registered"):
            await write_host(Mock(), host_create, current_user, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_host_create_failed(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    host_create = HostCreate(name="host-01", status=HostStatus.OFFLINE)

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=None)

        with patch("src.app.api.v1.hosts.secrets.token_urlsafe", return_value="api-key"):
            with patch("src.app.api.v1.hosts.get_password_hash", return_value="hashed_key"):
                with pytest.raises(NotFoundException, match="Failed to create host"):
                    await write_host(Mock(), host_create, current_user, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_hosts_success(mock_db):
    hosts_data = {"data": [{"uuid": str(uuid7())}], "count": 1}
    expected_response = {"data": hosts_data["data"], "pagination": {}}

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=hosts_data)

        with patch("src.app.api.v1.hosts.paginated_response", return_value=expected_response):
            result = await read_hosts(Mock(), mock_db, page=1, items_per_page=10)

    assert result == expected_response


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_hosts_passes_pagination_params(mock_db):
    hosts_data = {"data": [], "count": 0}
    expected_response = {"data": [], "pagination": {}}

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=hosts_data)

        with patch("src.app.api.v1.hosts.paginated_response", return_value=expected_response):
            result = await read_hosts(Mock(), mock_db, page=3, items_per_page=7)

    assert result == expected_response
    get_multi_kwargs = mock_crud.get_multi.call_args.kwargs
    assert get_multi_kwargs["offset"] == 14
    assert get_multi_kwargs["limit"] == 7
    assert get_multi_kwargs["is_deleted"] is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_host_success(mock_db):
    host_uuid = uuid7()
    host_read = HostRead(
        uuid=host_uuid,
        name="host-01",
        status=HostStatus.OFFLINE,
        user_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=host_read)

        result = await read_host(Mock(), host_uuid, mock_db)

    assert result == host_read


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_host_not_found(mock_db):
    host_uuid = uuid7()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Host not found"):
            await read_host(Mock(), host_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_host_success(mock_db):
    host_uuid = uuid7()
    host_update = HostUpdate(name="host-02")
    db_host = {"uuid": host_uuid, "name": "host-01"}
    updated_host = HostRead(
        uuid=host_uuid,
        name="host-02",
        status=HostStatus.OFFLINE,
        user_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(side_effect=[db_host, updated_host])
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.update = AsyncMock(return_value=None)

        result = await update_host(Mock(), host_update, host_uuid, mock_db)

    assert result == updated_host


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_host_duplicate_name(mock_db):
    host_uuid = uuid7()
    host_update = HostUpdate(name="host-02")
    db_host = {"uuid": host_uuid, "name": "host-01"}

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=db_host)
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Host name is already registered"):
            await update_host(Mock(), host_update, host_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_host_not_found(mock_db):
    host_uuid = uuid7()
    host_update = HostUpdate(name="host-02")

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Host not found"):
            await update_host(Mock(), host_update, host_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_host_success(mock_db):
    host_uuid = uuid7()
    host_read = HostRead(
        uuid=host_uuid,
        name="host-01",
        status=HostStatus.OFFLINE,
        user_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=host_read)
        mock_crud.delete = AsyncMock(return_value=None)

        result = await erase_host(Mock(), host_uuid, mock_db)

    assert result == {"message": "Host deleted"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_host_not_found(mock_db):
    host_uuid = uuid7()

    with patch("src.app.api.v1.hosts.crud_hosts") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Host not found"):
            await erase_host(Mock(), host_uuid, mock_db)

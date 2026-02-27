"""Unit tests for device API endpoints."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from uuid6 import uuid7

from src.app.api.v1.devices import (
    erase_device,
    read_available_devices,
    read_device,
    read_devices,
    update_device,
    write_device,
)
from src.app.core.exceptions.http_exceptions import DuplicateValueException, NotFoundException
from src.app.models.enums import DeviceStatus
from src.app.schemas.device import DeviceRead, DeviceTeacherCreate, DeviceTeacherUpdate


class _ScalarResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_device_success(mock_db):
    device_create = DeviceTeacherCreate(
        name="device-01",
        port="/dev/ttyUSB0",
        host_uuid=uuid7(),
    )
    device_read = DeviceRead(
        uuid=uuid7(),
        name=device_create.name,
        port=device_create.port,
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=device_create.host_uuid,
    ).model_dump()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=device_read)

        result = await write_device(Mock(), device_create, mock_db)

    assert result == device_read


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_device_duplicate_port(mock_db):
    device_create = DeviceTeacherCreate(
        name="device-01",
        port="/dev/ttyUSB0",
        host_uuid=uuid7(),
    )

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Port is already registered for this host"):
            await write_device(Mock(), device_create, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_device_create_failed(mock_db):
    device_create = DeviceTeacherCreate(
        name="device-01",
        port="/dev/ttyUSB0",
        host_uuid=uuid7(),
    )

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.create = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Failed to create device"):
            await write_device(Mock(), device_create, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_devices_success(mock_db, mock_redis):
    devices_data = {"data": [{"uuid": str(uuid7())}], "count": 1}
    expected_response = {"data": devices_data["data"], "pagination": {}}
    current_user = {"uuid": str(uuid7())}
    mock_db.execute = AsyncMock(return_value=_RowsResult([]))

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=devices_data)

        with patch("src.app.api.v1.devices.paginated_response", return_value=expected_response):
            result = await read_devices(
                request=Mock(), current_user=current_user, db=mock_db, redis=mock_redis, page=1, items_per_page=10
            )

    assert result == expected_response


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_devices_passes_pagination_params(mock_db, mock_redis):
    devices_data = {"data": [], "count": 0}
    expected_response = {"data": [], "pagination": {}}
    current_user = {"uuid": str(uuid7())}
    mock_db.execute = AsyncMock(return_value=_RowsResult([]))

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=devices_data)

        with patch("src.app.api.v1.devices.paginated_response", return_value=expected_response):
            result = await read_devices(
                request=Mock(), current_user=current_user, db=mock_db, redis=mock_redis, page=2, items_per_page=5
            )

    assert result == expected_response
    get_multi_kwargs = mock_crud.get_multi.call_args.kwargs
    assert get_multi_kwargs["offset"] == 5
    assert get_multi_kwargs["limit"] == 5
    assert get_multi_kwargs["is_deleted"] is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_devices_includes_occupancy_for_teacher(mock_db, mock_redis):
    device_uuid = uuid7()
    user_uuid = uuid7()
    session_uuid = uuid7()
    current_user = {"uuid": str(uuid7())}
    devices_data = {"data": [{"uuid": str(device_uuid), "status": DeviceStatus.AVAILABLE}], "count": 1}
    expected_response = {"data": devices_data["data"], "pagination": {}}
    session = SimpleNamespace(
        uuid=session_uuid,
        status="ACTIVE",
        connection_id=uuid7(),
        locked_at=None,
        expires_at=(datetime.now(UTC) + timedelta(minutes=5)).replace(tzinfo=None),
        user_uuid=user_uuid,
        device_uuid=device_uuid,
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    mock_db.execute = AsyncMock(return_value=_RowsResult([(session, "Busy Student")]))

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=devices_data)

        with patch("src.app.api.v1.devices.paginated_response", return_value=expected_response):
            result = await read_devices(
                request=Mock(), current_user=current_user, db=mock_db, redis=mock_redis, page=1, items_per_page=10
            )

    assert result["data"][0]["status"] == DeviceStatus.BUSY
    assert result["data"][0]["occupied_by_label"] == "Busy Student"
    assert result["data"][0]["occupied_by_you"] is False
    assert result["data"][0]["occupied_by_user_uuid"] == user_uuid
    assert result["data"][0]["active_session_uuid"] == session_uuid


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_devices_keeps_unavailable_status(mock_db, mock_redis):
    device_uuid = uuid7()
    current_user = {"uuid": str(uuid7())}
    devices_data = {"data": [{"uuid": str(device_uuid), "status": DeviceStatus.UNAVAILABLE}], "count": 1}
    expected_response = {"data": devices_data["data"], "pagination": {}}
    session = SimpleNamespace(
        uuid=uuid7(),
        status="ACTIVE",
        connection_id=uuid7(),
        locked_at=None,
        expires_at=(datetime.now(UTC) + timedelta(minutes=5)).replace(tzinfo=None),
        user_uuid=uuid7(),
        device_uuid=device_uuid,
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    mock_db.execute = AsyncMock(return_value=_RowsResult([(session, "Busy Student")]))

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=devices_data)

        with patch("src.app.api.v1.devices.paginated_response", return_value=expected_response):
            result = await read_devices(
                request=Mock(), current_user=current_user, db=mock_db, redis=mock_redis, page=1, items_per_page=10
            )

    assert result["data"][0]["status"] == DeviceStatus.UNAVAILABLE


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_available_devices_success(mock_db, mock_redis):
    device = SimpleNamespace(
        uuid=uuid7(),
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=uuid7(),
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    mock_db.execute = AsyncMock(side_effect=[_ScalarResult([device]), _RowsResult([])])

    result = await read_available_devices(Mock(), {"uuid": str(uuid7())}, mock_db, mock_redis)

    assert len(result) == 1
    assert result[0].uuid == device.uuid
    assert result[0].occupied_by_label is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_available_devices_converts_user_uuid_string(mock_db, mock_redis):
    device = SimpleNamespace(
        uuid=uuid7(),
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=uuid7(),
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    mock_db.execute = AsyncMock(side_effect=[_ScalarResult([device]), _RowsResult([])])
    current_user = {"uuid": str(uuid7())}

    with patch("src.app.api.v1.devices.uuid_pkg.UUID") as mock_uuid:
        mock_uuid.return_value = uuid7()
        result = await read_available_devices(Mock(), current_user, mock_db, mock_redis)

    assert mock_uuid.called
    assert len(result) == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_available_devices_marks_current_user_as_you(mock_db, mock_redis):
    user_uuid = uuid7()
    device_uuid = uuid7()
    device = SimpleNamespace(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.BUSY,
        host_uuid=uuid7(),
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    session = SimpleNamespace(
        uuid=uuid7(),
        status="ACTIVE",
        connection_id=uuid7(),
        locked_at=None,
        expires_at=(datetime.now(UTC) + timedelta(minutes=5)).replace(tzinfo=None),
        user_uuid=user_uuid,
        device_uuid=device_uuid,
        created_at=datetime.now(UTC).replace(tzinfo=None),
        updated_at=None,
    )
    mock_db.execute = AsyncMock(
        side_effect=[
            _ScalarResult([device]),
            _RowsResult([(session, "User Name")]),
        ]
    )

    result = await read_available_devices(Mock(), {"uuid": str(user_uuid)}, mock_db, mock_redis)

    assert len(result) == 1
    assert result[0].occupied_by_label == "You"
    assert result[0].occupied_by_you is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_device_success(mock_db):
    device_uuid = uuid7()
    device_read = DeviceRead(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=device_read)

        result = await read_device(Mock(), device_uuid, mock_db)

    assert result == device_read


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_device_not_found(mock_db):
    device_uuid = uuid7()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Device not found"):
            await read_device(Mock(), device_uuid, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_success(mock_db, mock_redis):
    device_uuid = uuid7()
    device_update = DeviceTeacherUpdate(is_enabled=False)
    db_device = {"uuid": device_uuid, "port": "/dev/ttyUSB0", "host_uuid": uuid7()}
    updated_device = DeviceRead(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.UNAVAILABLE,
        host_uuid=db_device["host_uuid"],
    ).model_dump()

    with (
        patch("src.app.api.v1.devices.crud_devices") as mock_crud,
        patch("src.app.api.v1.devices._get_active_session_for_device", AsyncMock(return_value=None)),
        patch("src.app.api.v1.devices._expire_session", AsyncMock(return_value=True)),
    ):
        mock_crud.get = AsyncMock(side_effect=[db_device, updated_device])
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.update = AsyncMock(return_value=None)

        result = await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)

    assert result == updated_device
    update_kwargs = mock_crud.update.call_args.kwargs
    assert update_kwargs["object"].status == DeviceStatus.UNAVAILABLE


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_reactivates_status(mock_db, mock_redis):
    device_uuid = uuid7()
    device_update = DeviceTeacherUpdate(is_enabled=True)
    db_device = {"uuid": device_uuid, "port": "/dev/ttyUSB0", "host_uuid": uuid7()}
    updated_device = DeviceRead(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=db_device["host_uuid"],
    ).model_dump()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(side_effect=[db_device, updated_device])
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.update = AsyncMock(return_value=None)

        result = await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)

    assert result == updated_device
    update_kwargs = mock_crud.update.call_args.kwargs
    assert update_kwargs["object"].status == DeviceStatus.AVAILABLE


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_duplicate_port(mock_db, mock_redis):
    device_uuid = uuid7()
    device_update = DeviceTeacherUpdate(port="/dev/ttyUSB1")
    db_device = {"uuid": device_uuid, "port": "/dev/ttyUSB0", "host_uuid": uuid7()}

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=db_device)
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Port is already registered for this host"):
            await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_duplicate_port_when_host_changes(mock_db, mock_redis):
    device_uuid = uuid7()
    new_host_uuid = uuid7()
    device_update = DeviceTeacherUpdate(host_uuid=new_host_uuid)
    db_device = {"uuid": device_uuid, "port": "/dev/ttyUSB0", "host_uuid": uuid7()}

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=db_device)
        mock_crud.exists = AsyncMock(return_value=True)

        with pytest.raises(DuplicateValueException, match="Port is already registered for this host"):
            await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_not_found(mock_db, mock_redis):
    device_uuid = uuid7()
    device_update = DeviceTeacherUpdate(name="device-new")

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Device not found"):
            await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_device_disabling_expires_active_session_and_releases_lock(mock_db, mock_redis):
    device_uuid = uuid7()
    device_update = DeviceTeacherUpdate(is_enabled=False)
    db_device = {"uuid": device_uuid, "port": "/dev/ttyUSB0", "host_uuid": uuid7()}
    active_session = {
        "uuid": uuid7(),
        "device_uuid": device_uuid,
        "status": "ACTIVE",
        "connection_id": uuid7(),
        "user_uuid": uuid7(),
    }
    updated_device = DeviceRead(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.UNAVAILABLE,
        host_uuid=db_device["host_uuid"],
    ).model_dump()

    with (
        patch("src.app.api.v1.devices.crud_devices") as mock_crud,
        patch("src.app.api.v1.devices._get_active_session_for_device", AsyncMock(return_value=active_session)),
        patch("src.app.api.v1.devices._expire_session", AsyncMock(return_value=True)) as mock_expire_session,
    ):
        mock_crud.get = AsyncMock(side_effect=[db_device, updated_device])
        mock_crud.exists = AsyncMock(return_value=False)
        mock_crud.update = AsyncMock(return_value=None)

        result = await update_device(Mock(), device_update, device_uuid, mock_db, mock_redis)

    assert result == updated_device
    mock_expire_session.assert_awaited_once_with(db=mock_db, redis=mock_redis, session=active_session)
    mock_redis.delete.assert_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_device_success(mock_db):
    device_uuid = uuid7()
    device_read = DeviceRead(
        uuid=device_uuid,
        name="device-01",
        port="/dev/ttyUSB0",
        baudrate=115200,
        status=DeviceStatus.AVAILABLE,
        host_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=device_read)
        mock_crud.delete = AsyncMock(return_value=None)

        result = await erase_device(Mock(), device_uuid, mock_db)

    assert result == {"message": "Device deleted"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_device_not_found(mock_db):
    device_uuid = uuid7()

    with patch("src.app.api.v1.devices.crud_devices") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Device not found"):
            await erase_device(Mock(), device_uuid, mock_db)

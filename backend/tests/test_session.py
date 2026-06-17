"""Unit tests for session API endpoints."""

import uuid as uuid_pkg
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import pytest
from uuid6 import uuid7

from src.app.api.v1.sessions import (
    erase_session,
    read_session,
    read_sessions,
    update_session,
    write_session,
)
from src.app.core.exceptions.http_exceptions import ForbiddenException, NotFoundException
from src.app.models.enums import DeviceStatus, SessionStatus, UserRole
from src.app.schemas.session import SessionCreate, SessionRead, SessionUpdate


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_overrides_user_for_student(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
    )
    created_session = SessionRead(
        uuid=uuid7(),
        status=session_create.status,
        connection_id=session_create.connection_id,
        locked_at=None,
        expires_at=None,
        user_uuid=current_user["uuid"],
        device_uuid=session_create.device_uuid,
    ).model_dump()

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=None)
        mock_crud.create = AsyncMock(return_value=created_session)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)

        result = await write_session(Mock(), session_create, current_user, mock_db, mock_redis)

        create_kwargs = mock_crud.create.call_args.kwargs
        assert create_kwargs["object"].user_uuid == uuid_pkg.UUID(current_user["uuid"])

    assert result == created_session


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_create_failed(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
    )

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=None)
        mock_crud.create = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Failed to create session"):
            await write_session(Mock(), session_create, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_busy_device(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    other_user_uuid = uuid7()
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
    )

    mock_redis.get = AsyncMock(
        return_value=f'{{"user_uuid":"{other_user_uuid}","connection_id":"{uuid7()}"}}',
    )

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=None)
        mock_crud.create = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})

        with pytest.raises(ForbiddenException, match="Device is busy"):
            await write_session(Mock(), session_create, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_takeover_updates_connection_for_same_user(mock_db, mock_redis):
    user_uuid = uuid7()
    current_user = {"uuid": str(user_uuid), "role": UserRole.STUDENT}
    old_connection_id = uuid7()
    new_connection_id = uuid7()
    session_uuid = uuid7()
    device_uuid = uuid7()
    now = datetime.now(UTC)
    active_session = {
        "uuid": session_uuid,
        "status": SessionStatus.ACTIVE,
        "connection_id": old_connection_id,
        "locked_at": now - timedelta(minutes=1),
        "expires_at": now + timedelta(minutes=10),
        "user_uuid": user_uuid,
        "device_uuid": device_uuid,
        "created_at": now - timedelta(minutes=5),
        "updated_at": None,
    }
    updated_session = {
        **active_session,
        "connection_id": new_connection_id,
        "locked_at": now,
    }
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=new_connection_id,
        locked_at=None,
        expires_at=None,
        user_uuid=user_uuid,
        device_uuid=device_uuid,
    )
    mock_redis.get = AsyncMock(
        return_value=(
            f'{{"user_uuid":"{user_uuid}","connection_id":"{old_connection_id}",'
            f'"session_uuid":"{session_uuid}","expires_at":"{(now + timedelta(minutes=10)).isoformat()}"}}'
        ),
    )

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(side_effect=[active_session, updated_session])
        mock_crud.create = AsyncMock(return_value=None)
        mock_crud.update = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)

        result = await write_session(Mock(), session_create, current_user, mock_db, mock_redis)

    assert result == updated_session
    update_kwargs = mock_crud.update.call_args.kwargs
    assert update_kwargs["uuid"] == session_uuid
    assert update_kwargs["object"].connection_id == new_connection_id
    assert mock_crud.create.await_count == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_expires_stale_disconnected_session(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    other_user_uuid = uuid7()
    old_connection_id = uuid7()
    stale_session_uuid = uuid7()
    device_uuid = uuid7()
    now = datetime.now(UTC)
    active_session = {
        "uuid": stale_session_uuid,
        "status": SessionStatus.ACTIVE,
        "connection_id": old_connection_id,
        "locked_at": now - timedelta(minutes=15),
        "expires_at": now + timedelta(minutes=10),
        "user_uuid": other_user_uuid,
        "device_uuid": device_uuid,
        "created_at": now - timedelta(minutes=20),
        "updated_at": None,
    }
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=device_uuid,
    )
    created_session = SessionRead(
        uuid=uuid7(),
        status=SessionStatus.ACTIVE,
        connection_id=session_create.connection_id,
        locked_at=now,
        expires_at=now + timedelta(minutes=30),
        user_uuid=uuid_pkg.UUID(current_user["uuid"]),
        device_uuid=device_uuid,
    ).model_dump()
    disconnected_at = (now - timedelta(minutes=6)).isoformat()
    lock_payload = (
        f'{{"user_uuid":"{other_user_uuid}","connection_id":"{old_connection_id}",'
        f'"session_uuid":"{stale_session_uuid}","disconnected_at":"{disconnected_at}"}}'
    )
    mock_redis.get = AsyncMock(side_effect=[lock_payload, lock_payload, None])
    mock_redis.delete = AsyncMock(return_value=True)
    mock_redis.set = AsyncMock(return_value=True)

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=active_session)
        mock_crud.update = AsyncMock(return_value=None)
        mock_crud.create = AsyncMock(return_value=created_session)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)

        result = await write_session(Mock(), session_create, current_user, mock_db, mock_redis)

    assert result == created_session
    assert mock_crud.update.await_count >= 1
    first_update_kwargs = mock_crud.update.await_args_list[0].kwargs
    assert first_update_kwargs["uuid"] == stale_session_uuid
    assert first_update_kwargs["object"].status == SessionStatus.EXPIRED
    assert mock_redis.delete.await_count >= 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_sessions_filters_by_user_for_student(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    sessions_data = {"data": [{"uuid": str(uuid7())}], "count": 1}
    expected_response = {"data": sessions_data["data"], "pagination": {}}

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get_multi = AsyncMock(return_value=sessions_data)

        with patch("src.app.api.v1.sessions.paginated_response", return_value=expected_response):
            result = await read_sessions(Mock(), current_user, mock_db, page=1, items_per_page=10)

    get_multi_kwargs = mock_crud.get_multi.call_args.kwargs
    assert get_multi_kwargs["user_uuid"] == uuid_pkg.UUID(current_user["uuid"])

    assert result == expected_response


@pytest.mark.asyncio
@pytest.mark.unit
async def test_write_session_unavailable_device(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_create = SessionCreate(
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
    )

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.UNAVAILABLE})

        with pytest.raises(ForbiddenException, match="Device is unavailable"):
            await write_session(Mock(), session_create, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_session_not_found(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Session not found"):
            await read_session(Mock(), session_uuid, current_user, mock_db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_read_session_filters_by_user_for_student(mock_db):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    session_uuid = uuid7()
    session_read = SessionRead(
        uuid=session_uuid,
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid_pkg.UUID(current_user["uuid"]),
        device_uuid=uuid7(),
    ).model_dump()

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=session_read)

        result = await read_session(Mock(), session_uuid, current_user, mock_db)

    assert result == session_read
    get_kwargs = mock_crud.get.call_args.kwargs
    assert get_kwargs["user_uuid"] == uuid_pkg.UUID(current_user["uuid"])
    assert get_kwargs["uuid"] == session_uuid
    assert get_kwargs["is_deleted"] is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_session_forbidden_for_student(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    session_uuid = uuid7()
    db_session = {"uuid": session_uuid, "device_uuid": uuid7()}
    session_update = SessionUpdate(user_uuid=uuid7())

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=db_session)

        with pytest.raises(ForbiddenException):
            await update_session(Mock(), session_update, session_uuid, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_session_forbidden_device_change_for_student(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    session_uuid = uuid7()
    db_session = {"uuid": session_uuid, "device_uuid": uuid7()}
    session_update = SessionUpdate(device_uuid=uuid7())

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=db_session)

        with pytest.raises(ForbiddenException):
            await update_session(Mock(), session_update, session_uuid, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_session_success(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()
    session_update = SessionUpdate(status=SessionStatus.CLOSED)
    connection_id = uuid7()
    db_session = {
        "uuid": session_uuid,
        "device_uuid": uuid7(),
        "connection_id": connection_id,
        "user_uuid": uuid7(),
    }
    updated_session = SessionRead(
        uuid=session_uuid,
        status=SessionStatus.CLOSED,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=db_session["device_uuid"],
    ).model_dump()

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(side_effect=[db_session, updated_session])
        mock_crud.update = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)
        mock_redis.get = AsyncMock(return_value=str(connection_id))
        mock_redis.delete = AsyncMock(return_value=True)

        result = await update_session(Mock(), session_update, session_uuid, current_user, mock_db, mock_redis)

    assert result == updated_session


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_session_does_not_override_unavailable_device(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()
    session_update = SessionUpdate(status=SessionStatus.CLOSED)
    connection_id = uuid7()
    db_session = {
        "uuid": session_uuid,
        "device_uuid": uuid7(),
        "connection_id": connection_id,
        "user_uuid": uuid7(),
    }
    updated_session = SessionRead(
        uuid=session_uuid,
        status=SessionStatus.CLOSED,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=db_session["device_uuid"],
    ).model_dump()

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(side_effect=[db_session, updated_session])
        mock_crud.update = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.UNAVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)
        mock_redis.get = AsyncMock(return_value=str(connection_id))
        mock_redis.delete = AsyncMock(return_value=True)

        result = await update_session(Mock(), session_update, session_uuid, current_user, mock_db, mock_redis)

    assert result == updated_session
    assert mock_devices.update.await_count == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_session_not_found(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()
    session_update = SessionUpdate(status=SessionStatus.CLOSED)

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Session not found"):
            await update_session(Mock(), session_update, session_uuid, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_session_success(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()
    connection_id = uuid7()
    session_read = SessionRead(
        uuid=session_uuid,
        status=SessionStatus.ACTIVE,
        connection_id=connection_id,
        locked_at=None,
        expires_at=None,
        user_uuid=uuid7(),
        device_uuid=uuid7(),
    ).model_dump()

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=session_read)
        mock_crud.delete = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)
        mock_redis.get = AsyncMock(return_value=str(connection_id))
        mock_redis.delete = AsyncMock(return_value=True)

        result = await erase_session(Mock(), session_uuid, current_user, mock_db, mock_redis)

    assert result == {"message": "Session deleted"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_session_not_found(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.TEACHER}
    session_uuid = uuid7()

    with patch("src.app.api.v1.sessions.crud_sessions") as mock_crud:
        mock_crud.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Session not found"):
            await erase_session(Mock(), session_uuid, current_user, mock_db, mock_redis)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_erase_session_filters_by_user_for_student(mock_db, mock_redis):
    current_user = {"uuid": str(uuid7()), "role": UserRole.STUDENT}
    session_uuid = uuid7()
    session_read = SessionRead(
        uuid=session_uuid,
        status=SessionStatus.ACTIVE,
        connection_id=uuid7(),
        locked_at=None,
        expires_at=None,
        user_uuid=uuid_pkg.UUID(current_user["uuid"]),
        device_uuid=uuid7(),
    ).model_dump()

    with (
        patch("src.app.api.v1.sessions.crud_sessions") as mock_crud,
        patch("src.app.api.v1.sessions.crud_devices") as mock_devices,
    ):
        mock_crud.get = AsyncMock(return_value=session_read)
        mock_crud.delete = AsyncMock(return_value=None)
        mock_devices.get = AsyncMock(return_value={"status": DeviceStatus.AVAILABLE})
        mock_devices.update = AsyncMock(return_value=None)
        mock_redis.get = AsyncMock(return_value=str(session_read["connection_id"]))
        mock_redis.delete = AsyncMock(return_value=True)

        result = await erase_session(Mock(), session_uuid, current_user, mock_db, mock_redis)

    assert result == {"message": "Session deleted"}
    get_kwargs = mock_crud.get.call_args.kwargs
    assert get_kwargs["user_uuid"] == uuid_pkg.UUID(current_user["uuid"])
    assert get_kwargs["uuid"] == session_uuid

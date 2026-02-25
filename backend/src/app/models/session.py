import uuid as uuid_pkg
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from uuid6 import uuid7

from ..core.db.database import Base
from .enums import SessionStatus


class Session(Base):
    __tablename__ = "sessions"

    user_uuid: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.uuid"), index=True)
    device_uuid: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.uuid"), index=True)

    status: Mapped[SessionStatus] = mapped_column(
        SqlEnum(SessionStatus, name="session_status"), default=SessionStatus.ACTIVE, index=True
    )
    connection_id: Mapped[uuid_pkg.UUID] = mapped_column(
        UUID(as_uuid=True), default_factory=uuid7, unique=True, index=True
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    uuid: Mapped[uuid_pkg.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default_factory=uuid7, unique=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default_factory=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    is_deleted: Mapped[bool] = mapped_column(default=False, index=True)

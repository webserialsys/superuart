import uuid as uuid_pkg
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from uuid6 import uuid7

from ..core.db.database import Base
from .enums import DeviceStatus


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("host_uuid", "port", name="uq_devices_host_port"),)

    name: Mapped[str] = mapped_column(String(120), index=True)
    port: Mapped[str] = mapped_column(String(120), index=True)
    host_uuid: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("hosts.uuid"), index=True)

    baudrate: Mapped[int] = mapped_column(Integer, default=115200)
    status: Mapped[DeviceStatus] = mapped_column(
        SqlEnum(DeviceStatus, name="device_status"), default=DeviceStatus.AVAILABLE, index=True
    )
    uuid: Mapped[uuid_pkg.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default_factory=uuid7, unique=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default_factory=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    is_deleted: Mapped[bool] = mapped_column(default=False, index=True)

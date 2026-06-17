from datetime import datetime
from typing import Annotated
import uuid as uuid_pkg

from pydantic import BaseModel, ConfigDict, Field

from ..core.schemas import PersistentDeletion, TimestampSchema, UUIDSchema
from ..models.enums import DeviceStatus


class DeviceBase(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=120, examples=["STM32 Nucleo F401"])]
    port: Annotated[str, Field(min_length=2, max_length=120, examples=["/dev/ttyUSB0"])]
    baudrate: Annotated[int, Field(default=115200, examples=[115200])]
    status: Annotated[DeviceStatus, Field(default=DeviceStatus.AVAILABLE, examples=["AVAILABLE"])]
    host_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]


class Device(DeviceBase, UUIDSchema, TimestampSchema, PersistentDeletion):
    pass


class DeviceRead(DeviceBase, UUIDSchema, TimestampSchema):
    pass


class DeviceAvailabilityRead(DeviceRead):
    occupied_by_user_uuid: uuid_pkg.UUID | None = Field(default=None)
    occupied_by_label: str | None = Field(default=None)
    occupied_by_you: bool = Field(default=False)
    active_session_uuid: uuid_pkg.UUID | None = Field(default=None)
    active_session_expires_at: datetime | None = Field(default=None)


class DeviceCreate(DeviceBase):
    model_config = ConfigDict(extra="forbid")


class DeviceCreateInternal(DeviceBase):
    pass


class DeviceTeacherCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=2, max_length=120, examples=["STM32 Nucleo F401"])]
    port: Annotated[str, Field(min_length=2, max_length=120, examples=["/dev/ttyUSB0"])]
    host_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(min_length=2, max_length=120, default=None)
    port: str | None = Field(min_length=2, max_length=120, default=None)
    baudrate: int | None = Field(default=None)
    status: DeviceStatus | None = Field(default=None)
    host_uuid: uuid_pkg.UUID | None = Field(default=None)


class DeviceUpdateInternal(DeviceUpdate):
    updated_at: datetime


class DeviceTeacherUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(min_length=2, max_length=120, default=None)
    port: str | None = Field(min_length=2, max_length=120, default=None)
    host_uuid: uuid_pkg.UUID | None = Field(default=None)
    is_enabled: bool | None = Field(default=None)


class DeviceDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

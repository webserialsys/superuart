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


class DeviceCreate(DeviceBase):
    model_config = ConfigDict(extra="forbid")


class DeviceCreateInternal(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str | None, Field(min_length=2, max_length=120, default=None)]
    port: Annotated[str | None, Field(min_length=2, max_length=120, default=None)]
    baudrate: Annotated[int | None, Field(default=None)]
    status: Annotated[DeviceStatus | None, Field(default=None)]
    host_uuid: Annotated[uuid_pkg.UUID | None, Field(default=None)]


class DeviceUpdateInternal(DeviceUpdate):
    updated_at: datetime


class DeviceDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

import uuid as uuid_pkg
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from uuid6 import uuid7

from ..core.schemas import PersistentDeletion, TimestampSchema, UUIDSchema
from ..models.enums import SessionStatus


class SessionBase(BaseModel):
    status: Annotated[SessionStatus, Field(default=SessionStatus.ACTIVE, examples=["ACTIVE"])]
    connection_id: Annotated[
        uuid_pkg.UUID,
        Field(default_factory=uuid7, examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"]),
    ]
    locked_at: Annotated[datetime | None, Field(default=None)]
    expires_at: Annotated[datetime | None, Field(default=None)]
    user_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]
    device_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]


class Session(SessionBase, UUIDSchema, TimestampSchema, PersistentDeletion):
    pass


class SessionRead(SessionBase, UUIDSchema, TimestampSchema):
    pass


class SessionCreate(SessionBase):
    model_config = ConfigDict(extra="forbid")


class SessionCreateInternal(SessionBase):
    pass


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Annotated[SessionStatus | None, Field(default=None)]
    connection_id: Annotated[uuid_pkg.UUID | None, Field(default=None)]
    locked_at: Annotated[datetime | None, Field(default=None)]
    expires_at: Annotated[datetime | None, Field(default=None)]
    user_uuid: Annotated[uuid_pkg.UUID | None, Field(default=None)]
    device_uuid: Annotated[uuid_pkg.UUID | None, Field(default=None)]


class SessionUpdateInternal(SessionUpdate):
    updated_at: datetime


class SessionDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

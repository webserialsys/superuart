import uuid as uuid_pkg
from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from ..core.schemas import UUIDSchema


class AccessBase(BaseModel):
    user_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]
    device_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]
    granted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = Field(default=None)


class Access(AccessBase, UUIDSchema):
    pass


class AccessRead(AccessBase, UUIDSchema):
    pass


class AccessCreate(AccessBase):
    model_config = ConfigDict(extra="forbid")


class AccessCreateInternal(AccessBase):
    pass


class AccessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_at: datetime | None = Field(default=None)


class AccessUpdateInternal(AccessUpdate):
    pass

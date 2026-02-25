from datetime import datetime
from typing import Annotated

import uuid as uuid_pkg

from pydantic import BaseModel, ConfigDict, Field

from ..core.schemas import PersistentDeletion, TimestampSchema, UUIDSchema
from ..models.enums import HostStatus


class HostBase(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=120, examples=["uart-host-01"])]
    status: Annotated[HostStatus, Field(default=HostStatus.OFFLINE, examples=["OFFLINE"])]


class HostInternalBase(HostBase):
    api_key_hash: Annotated[str, Field(min_length=8, max_length=200, examples=["$2b$12$...."])]
    user_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]


class HostPublicBase(HostBase):
    user_uuid: Annotated[uuid_pkg.UUID, Field(examples=["01950a71-4f98-7d34-b5b5-8f6f8c2c0e4a"])]


class Host(HostInternalBase, UUIDSchema, TimestampSchema, PersistentDeletion):
    pass


class HostRead(HostPublicBase, UUIDSchema, TimestampSchema):
    pass


class HostCreate(HostBase):
    model_config = ConfigDict(extra="forbid")


class HostCreateResponse(BaseModel):
    host: HostRead
    api_key: str


class HostCreateInternal(HostInternalBase):
    pass


class HostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str | None, Field(min_length=2, max_length=120, default=None)]
    status: Annotated[HostStatus | None, Field(default=None)]


class HostUpdateInternal(HostUpdate):
    updated_at: datetime


class HostDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

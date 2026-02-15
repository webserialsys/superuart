from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..core.schemas import PersistentDeletion, TimestampSchema, UUIDSchema


class UserBase(BaseModel):
    email: Annotated[EmailStr, Field(examples=["user@example.com"])]
    full_name: Annotated[str, Field(min_length=2, max_length=100, examples=["User Userson"])]


class User(TimestampSchema, UserBase, UUIDSchema, PersistentDeletion):
    hashed_password: str


class UserRead(TimestampSchema, UserBase, UUIDSchema):
    pass


class UserCreate(UserBase):
    model_config = ConfigDict(extra="forbid")

    password: Annotated[str, Field(min_length=8, examples=["Qwerty123!"])]


class UserCreateInternal(UserBase):
    hashed_password: str


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[EmailStr | None, Field(examples=["piter@example.com"], default=None)]
    full_name: Annotated[str | None, Field(min_length=2, max_length=100, examples=["Piter Parker"], default=None)]


class UserUpdateInternal(UserUpdate):
    updated_at: datetime


class UserDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..core.schemas import PersistentDeletion, TimestampSchema, UUIDSchema
from ..models.enums import UserRole


class UserBase(BaseModel):
    email: Annotated[EmailStr, Field(examples=["user@example.com"])]
    full_name: Annotated[str, Field(min_length=2, max_length=100, examples=["User Userson"])]


class UserRoleSchema(BaseModel):
    role: UserRole = Field(default=UserRole.STUDENT, examples=["student"])


class User(TimestampSchema, UserBase, UUIDSchema, UserRoleSchema, PersistentDeletion):
    hashed_password: str


class UserRead(TimestampSchema, UserBase, UUIDSchema, UserRoleSchema):
    pass


class UserCreate(UserBase, UserRoleSchema):
    model_config = ConfigDict(extra="forbid")

    password: Annotated[str, Field(min_length=8, examples=["Qwerty123!"])]


class UserCreateInternal(UserBase):
    hashed_password: str
    role: UserRole = UserRole.STUDENT


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = Field(examples=["piter@example.com"], default=None)
    full_name: str | None = Field(min_length=2, max_length=100, examples=["Piter Parker"], default=None)


class UserUpdateInternal(UserUpdate):
    updated_at: datetime


class UserDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_deleted: bool
    deleted_at: datetime

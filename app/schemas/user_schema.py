from typing import Annotated, Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    org_name: Optional[str] = None
    email: EmailStr
    password: Annotated[str, Field(min_length=8)]
    invite_token: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr


class UserMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: Optional[str] = None
    org_id: Optional[int] = None
    role: Optional[str] = None
    permissions: Optional[dict[str, Any]] = None

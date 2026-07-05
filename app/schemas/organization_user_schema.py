from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class OrganizationInvite(BaseModel):
    email: EmailStr
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("role must not be empty")
        return v.strip()


class OrganizationMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    organization_id: int
    role: str
    email: EmailStr
    joined_at: datetime

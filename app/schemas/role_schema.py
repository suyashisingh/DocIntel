from typing import Any

from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: dict[str, Any] = {}


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: dict[str, Any] | None = None


class RoleResponse(BaseModel):
    id: int
    name: str
    description: str | None
    permissions: dict[str, Any]
    is_system: bool

    model_config = {"from_attributes": True}

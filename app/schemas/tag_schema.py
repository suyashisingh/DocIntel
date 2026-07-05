from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class TagCreate(BaseModel):
    name: str
    color: str | None = None
    is_global: bool = False

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Tag name must not be empty")
        return v.strip()


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    is_global: bool | None = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None
    created_by: int
    is_global: bool
    created_at: datetime
    doc_count: int = 0

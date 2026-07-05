from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class FolderCreate(BaseModel):
    name: str
    color: str | None = None
    parent_id: int | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Folder name must not be empty")
        return v.strip()


class FolderUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Folder name must not be empty")
        return v.strip() if v else v


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    name: str
    color: str | None
    owner_id: int | None
    parent_id: int | None
    created_at: datetime
    document_count: int = 0

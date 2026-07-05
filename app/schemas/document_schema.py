from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    uploaded_by: int | None
    file_path: str
    original_filename: str | None
    document_type: str | None
    status: str
    upload_time: datetime
    expires_at: datetime | None = None
    retention_days: int | None = None


class TagInline(BaseModel):
    id: int
    name: str
    color: str | None


class DocumentListItem(DocumentResponse):
    folder_ids: list[int] = []
    tags: list[TagInline] = []
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Any


class ExtractedDataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    version_number: int
    structured_json: Any
    confidence_score: float | None
    processed_at: datetime
    original_filename: str | None = None
    summary: str | None = None
    suggested_questions: list | None = None
    expires_at: datetime | None = None
    retention_days: int | None = None
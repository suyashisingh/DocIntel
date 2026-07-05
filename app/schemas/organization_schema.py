from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class OrganizationCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str

from sqlalchemy import Column, Integer, ForeignKey, DateTime, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class ExtractedData(Base):
    __tablename__ = "extracted_data"

    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_number = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    structured_json = Column(
        JSONB,
        nullable=False
    )

    confidence_score = Column(Float, nullable=True)

    processed_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    document = relationship("Document", back_populates="extracted_data")
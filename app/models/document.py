from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


# ⭐ Professional document status state machine
class DocumentStatus(str, enum.Enum):
    uploaded = "uploaded"
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    file_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)

    # ⭐ Will be dynamically detected by AI pipeline
    document_type = Column(String, nullable=True, index=True)

    # ⭐ Professional status tracking
    status = Column(
    Enum(DocumentStatus, name="document_status_enum"),
    default=DocumentStatus.uploaded,
    index=True,
    nullable=False
    )


    upload_time = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    searchable_text = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    suggested_questions = Column(JSON, nullable=True)

    expires_at = Column(DateTime(timezone=True), nullable=True)
    retention_days = Column(Integer, nullable=True)

    # NULL = not yet scanned; True = PII found; False = scan ran, nothing found
    pii_detected = Column(Boolean, nullable=True)
    pii_types_found = Column(JSON, nullable=True)
    pii_redacted = Column(Boolean, nullable=False, default=False, server_default="false")
    pii_redacted_types = Column(JSON, nullable=True)
    pii_redacted_at = Column(DateTime(timezone=True), nullable=True)

    # ⭐ relationships
    organization = relationship("Organization", backref="documents")

    uploader = relationship("User", backref="uploaded_documents")

    extracted_data = relationship(
        "ExtractedData",
        back_populates="document",
        cascade="all, delete"
    )
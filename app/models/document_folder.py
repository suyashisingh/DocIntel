from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.sql import func

from app.database import Base


class DocumentFolder(Base):
    __tablename__ = "document_folders"

    document_id = Column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    folder_id = Column(
        Integer,
        ForeignKey("folders.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

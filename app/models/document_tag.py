from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func

from app.database import Base


class DocumentTag(Base):
    __tablename__ = "document_tags"

    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    tagged_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tagged_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.database import Base


class Comparison(Base):
    __tablename__ = "comparisons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    doc_a_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    doc_b_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    result = Column(JSONB, nullable=True)
    summary = Column(Text, nullable=True)
    similarity_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

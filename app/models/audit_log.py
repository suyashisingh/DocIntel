import uuid

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id        = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email    = Column(String(256), nullable=False)
    action        = Column(String(64), nullable=False, index=True)
    resource_type = Column(String(64), nullable=False)
    resource_name = Column(String(256), nullable=False)
    details       = Column(JSONB, nullable=False, server_default="{}", default=dict)
    ip_address    = Column(String(45), nullable=True)
    created_at    = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

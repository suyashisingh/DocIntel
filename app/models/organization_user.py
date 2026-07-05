import enum

from sqlalchemy import Column, Integer, ForeignKey, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class OrgRole(str, enum.Enum):
    """Organisation-level roles.

    Subclasses ``str`` so that enum members compare equal to their string
    values (e.g. ``OrgRole.ADMIN == "admin"`` is ``True``), making them
    transparent to SQLAlchemy's String column, JSON serialisation, and any
    code that receives roles as plain strings from the database.
    """
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


class OrganizationUser(Base):
    __tablename__ = "organization_users"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True
    )

    role = Column(String, nullable=False)

    joined_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    user = relationship("User", back_populates="organizations")
    organization = relationship("Organization", back_populates="members")

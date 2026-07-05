from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String(100), nullable=True)

    # Relationship to OrganizationUser (RBAC bridge table)
    organizations = relationship(
        "OrganizationUser",
        back_populates="user",
        cascade="all, delete-orphan"
    )
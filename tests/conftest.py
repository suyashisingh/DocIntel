"""
Shared fixtures for the AI Document Intelligence test suite.

Test database
─────────────
Reads TEST_DATABASE_URL from the environment.  If unset, it derives the URL
from settings.DATABASE_URL by replacing the database name with "docintel_test".
The production database is never touched.

Isolation
─────────
Tables are created once per session (setup_test_db).
After every test, all rows are truncated and sequences reset (clean_tables).
This is simpler than savepoint tricks and works reliably with PostgreSQL.

Mocks
─────
mock_celery  — replaces process_document_task so no Redis broker is needed.
mock_storage — replaces save_document so no real files are written.
Both are autouse so every test is protected automatically; tests that need to
assert on mock calls can request them by name to receive the MagicMock.

Install requirements (not in venv by default):
    pip install pytest pytest-asyncio httpx
"""

import os
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  — registers all ORM models with Base
from app.auth.jwt_handler import create_access_token
from app.auth.security import hash_password
from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.document import Document, DocumentStatus
from app.models.extracted_data import ExtractedData
from app.models.organization import Organization
from app.models.organization_user import OrgRole, OrganizationUser
from app.models.user import User

# ---------------------------------------------------------------------------
# Test database — never use the production URL
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    # Default: same host/user/password, different database name
    settings.DATABASE_URL.rsplit("/", 1)[0] + "/docintel_test",
)

test_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# ---------------------------------------------------------------------------
# Schema lifecycle
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create all tables once for the whole test session, then drop them."""
    Base.metadata.create_all(bind=test_engine)
    # Add the version_number column for databases that predate the migration.
    # Idempotent — safe whether the column already exists or not.
    with test_engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE extracted_data "
            "ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1"
        ))
        conn.commit()
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(autouse=True)
def clean_tables(setup_test_db):
    """Truncate every table and reset sequences after each test."""
    yield
    table_names = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    with test_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))


# ---------------------------------------------------------------------------
# Core fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    """A SQLAlchemy session bound to the test database."""
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture
def client(db):
    """
    TestClient with get_db overridden to use the test session.

    Not used as a context manager deliberately: the context manager triggers
    FastAPI's startup event, which would run create_all and ALTER TABLE
    against the production database engine imported by main.py.
    """
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Infrastructure mocks  (autouse — every test is isolated by default)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_celery(monkeypatch):
    """
    Replace Celery task dispatch with a MagicMock.

    Tests that need to assert on dispatch calls should request this fixture
    by name:  def test_foo(client, mock_celery): ...
    """
    mock = MagicMock()
    monkeypatch.setattr("app.routes.document_routes.process_document_task", mock)
    return mock


@pytest.fixture(autouse=True)
def mock_storage(monkeypatch, tmp_path):
    """Replace save_document so upload tests never write to the real filesystem."""
    fake_path = str(tmp_path / "test_document.pdf")
    open(fake_path, "wb").close()  # file must exist for any downstream checks
    monkeypatch.setattr(
        "app.routes.document_routes.save_document",
        lambda _file: fake_path,
    )


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db):
    user = User(email="admin@test.com", password_hash=hash_password("secret"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def analyst_user(db):
    user = User(email="analyst@test.com", password_hash=hash_password("secret"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def viewer_user(db):
    user = User(email="viewer@test.com", password_hash=hash_password("secret"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user):
    return create_access_token({"user_id": admin_user.id})


@pytest.fixture
def analyst_token(analyst_user):
    return create_access_token({"user_id": analyst_user.id})


@pytest.fixture
def viewer_token(viewer_user):
    return create_access_token({"user_id": viewer_user.id})


# ---------------------------------------------------------------------------
# Organisation fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def org(db, admin_user, analyst_user, viewer_user):
    """
    Organisation with all three role levels pre-enrolled.

    admin_user  → OrgRole.ADMIN
    analyst_user → OrgRole.ANALYST
    viewer_user  → OrgRole.VIEWER
    """
    o = Organization(name="Test Org")
    db.add(o)
    db.flush()
    for user, role in [
        (admin_user, OrgRole.ADMIN),
        (analyst_user, OrgRole.ANALYST),
        (viewer_user, OrgRole.VIEWER),
    ]:
        db.add(OrganizationUser(user_id=user.id, organization_id=o.id, role=role))
    db.commit()
    db.refresh(o)
    return o


# ---------------------------------------------------------------------------
# Factory fixtures — create DB rows without going through the HTTP API
# ---------------------------------------------------------------------------

@pytest.fixture
def make_document(db):
    """Return a factory that inserts a Document row directly into the test DB."""
    def _factory(org_id: int, uploaded_by_id: int, status=DocumentStatus.uploaded):
        doc = Document(
            organization_id=org_id,
            uploaded_by=uploaded_by_id,
            file_path="/fake/path/doc.pdf",
            status=status,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc
    return _factory


@pytest.fixture
def make_extracted(db):
    """Return a factory that inserts an ExtractedData row directly into the test DB."""
    def _factory(document_id: int, version_number: int = 1, doc_type: str = "generic"):
        ext = ExtractedData(
            document_id=document_id,
            version_number=version_number,
            structured_json={
                "entities": [],
                "text_length": 100,
                "document_type": doc_type,
            },
            confidence_score=0.85,
        )
        db.add(ext)
        db.commit()
        db.refresh(ext)
        return ext
    return _factory

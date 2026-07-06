import json
import logging

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.logging_config import setup_logging

# Configure logging before any other app code runs so that import-time
# log calls in submodules are captured with the correct format and level.
setup_logging(settings.LOG_LEVEL)

logger = logging.getLogger(__name__)

from app.database import engine, Base
from app import models  # ⭐ Import all models at once

from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.routes import auth_routes
from app.routes import organization_routes
from app.routes import document_routes
from app.routes import analytics_routes
from app.routes import ws_routes
from app.routes import chat_routes
from app.routes import comparison_routes
from app.routes import table_routes
from app.routes import role_routes
from app.routes import folder_routes
from app.routes import tag_routes
from app.routes import notification_routes
from app.routes import audit_routes
from app.routes import settings_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Document Intelligence API")

    # pgvector extension must exist before create_all tries to define vector columns.
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    Base.metadata.create_all(bind=engine)

    # Idempotent column migrations for databases that predate these columns.
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE extracted_data "
            "ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1"
        ))
        conn.execute(text(
            "ALTER TABLE documents "
            "ADD COLUMN IF NOT EXISTS searchable_text TEXT"
        ))
        conn.execute(text(
            "ALTER TABLE documents "
            "ADD COLUMN IF NOT EXISTS original_filename VARCHAR"
        ))
        conn.execute(text(
            "ALTER TABLE pending_invites "
            "ADD COLUMN IF NOT EXISTS invite_token VARCHAR"
        ))
        conn.execute(text(
            "ALTER TABLE documents "
            "ADD COLUMN IF NOT EXISTS summary TEXT"
        ))
        conn.execute(text(
            "ALTER TABLE documents "
            "ADD COLUMN IF NOT EXISTS suggested_questions JSON"
        ))
        # comparisons table is created by Base.metadata.create_all above;
        # this is a no-op guard for databases that predate the model import.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_tables (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                page_number INTEGER NOT NULL,
                table_index_on_page INTEGER NOT NULL,
                headers JSONB,
                rows JSONB NOT NULL,
                row_count INTEGER NOT NULL,
                column_count INTEGER NOT NULL,
                bbox JSONB,
                extraction_confidence FLOAT,
                embedding vector(384),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_qa (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id),
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_document_qa_doc_id
                ON document_qa(document_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS comparisons (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                doc_a_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                doc_b_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                mode VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'pending',
                result JSONB,
                summary TEXT,
                similarity_score FLOAT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS custom_roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(64) UNIQUE NOT NULL,
                description TEXT,
                permissions JSONB NOT NULL DEFAULT '{}',
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_custom_roles_name ON custom_roles(name)
        """))
        # Seed the three system roles (idempotent — skips on name conflict).
        _admin_perms = json.dumps({
            "documents": {"upload": True, "view": True, "delete": True, "reprocess": True, "export": True},
            "chat": {"use": True},
            "analytics": {"view": True},
            "team": {"view": True, "invite": True, "remove": True},
            "roles": {"view": True, "manage": True},
            "compare": {"use": True},
            "search": {"use": True},
        })
        _analyst_perms = json.dumps({
            "documents": {"upload": True, "view": True, "delete": False, "reprocess": True, "export": True},
            "chat": {"use": True},
            "analytics": {"view": True},
            "team": {"view": True, "invite": False, "remove": False},
            "roles": {"view": False, "manage": False},
            "compare": {"use": True},
            "search": {"use": True},
        })
        _viewer_perms = json.dumps({
            "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": True},
            "chat": {"use": True},
            "analytics": {"view": True},
            "team": {"view": False, "invite": False, "remove": False},
            "roles": {"view": False, "manage": False},
            "compare": {"use": True},
            "search": {"use": True},
        })
        conn.execute(
            text("""
                INSERT INTO custom_roles (name, description, permissions, is_system) VALUES
                    ('admin',   'Full administrative access',            CAST(:ap AS jsonb), true),
                    ('analyst', 'Can upload and process documents',      CAST(:bp AS jsonb), true),
                    ('viewer',  'Read-only access to documents',         CAST(:vp AS jsonb), true)
                ON CONFLICT (name) DO NOTHING
            """),
            {"ap": _admin_perms, "bp": _analyst_perms, "vp": _viewer_perms},
        )
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                name VARCHAR(128) NOT NULL,
                color VARCHAR(16),
                owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_folders_org_id ON folders(organization_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_folders_parent_id ON folders(parent_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_folders (
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (document_id, folder_id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_document_folders_folder_id ON document_folders(folder_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tags (
                id SERIAL PRIMARY KEY,
                name VARCHAR(64) NOT NULL,
                color VARCHAR(7),
                created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                is_global BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_tag_name_creator UNIQUE (name, created_by)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_tags_created_by ON tags(created_by)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_tags (
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                tagged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (document_id, tag_id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_document_tags_tag_id ON document_tags(tag_id)"
        ))
        conn.execute(text(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ"
        ))
        conn.execute(text(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_days INTEGER"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_documents_expires_at "
            "ON documents(expires_at) WHERE expires_at IS NOT NULL"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(128) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(32) NOT NULL DEFAULT 'info',
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                link VARCHAR(256),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notifications_user_id "
            "ON notifications(user_id, created_at DESC)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                user_email VARCHAR(256) NOT NULL,
                action VARCHAR(64) NOT NULL,
                resource_type VARCHAR(64) NOT NULL,
                resource_name VARCHAR(256) NOT NULL,
                details JSONB NOT NULL DEFAULT '{}',
                ip_address VARCHAR(45),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_id "
            "ON audit_logs(org_id, created_at DESC)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_action "
            "ON audit_logs(action)"
        ))
        conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_detected BOOLEAN"))
        conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_types_found JSON"))
        conn.execute(text(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_redacted BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_redacted_types JSON"))
        conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_redacted_at TIMESTAMPTZ"))
        # Explicit unique index on organization_users in addition to the composite PK,
        # so any pre-migration rows and application-level race conditions are caught.
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_users_user_org "
            "ON organization_users(user_id, organization_id)"
        ))
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)"
        ))
        conn.commit()

    logger.info("Database tables ready")
    yield


app = FastAPI(
    title="AI Document Intelligence API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


# --- Exception handlers ---------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Log HTTP errors and return the standard {"detail": ...} shape."""
    if exc.status_code >= 500:
        logger.error(
            "HTTP %d %s %s — %s",
            exc.status_code, request.method, request.url.path, exc.detail,
        )
    else:
        logger.warning(
            "HTTP %d %s %s — %s",
            exc.status_code, request.method, request.url.path, exc.detail,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for any exception not handled elsewhere.

    The full traceback is written to the log; the client only ever sees a
    generic 500 message so internal details are never leaked.
    """
    logger.exception(
        "Unhandled exception on %s %s",
        request.method, request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# --- Routers --------------------------------------------------------------

app.include_router(auth_routes.router)
app.include_router(organization_routes.router)
app.include_router(document_routes.router)
app.include_router(analytics_routes.router)
app.include_router(ws_routes.router)
app.include_router(chat_routes.router)
app.include_router(comparison_routes.router)
app.include_router(table_routes.router)
app.include_router(role_routes.router)
app.include_router(folder_routes.router)
app.include_router(tag_routes.router)
app.include_router(notification_routes.router)
app.include_router(audit_routes.router)
app.include_router(settings_routes.router)


@app.get("/")
def root():
    return {"message": "AI Document Intelligence API Running"}

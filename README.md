# DocIntel — AI Document Intelligence Platform

A multi-tenant SaaS platform for AI-powered document processing, extraction, search, and analysis — built as a final-year capstone project (BTech IT, Manipal Institute of Technology), developed in the context of an internship at Valuefy Technologies Pvt. Ltd., Mumbai.



> ⚠️ **Note on the live demo:** This is hosted entirely on free-tier infrastructure (Render + Neon + Upstash) to keep the project cost-free. The backend container is capped at 512MB RAM, which is tight for the ML models this app runs (embeddings, document classification) alongside FastAPI itself. As a result:
> - The backend may take 30-60 seconds to respond on the first request after a period of inactivity (free-tier cold start).
> - Uploading multiple large documents simultaneously, or occasionally a single large document, can hit the memory ceiling and trigger a restart.
> - For reliable, full-throughput testing (including bulk uploads, Celery-based async processing, and the full ML classification pipeline), please use the local Docker setup described below — this runs the complete, unconstrained architecture as designed.
>
> This tradeoff was a deliberate choice to keep the project fully free to host, rather than a limitation in the underlying design — see [Architecture & Design Decisions](#architecture--design-decisions) below for details.

---

## What It Does

DocIntel lets teams upload documents (PDFs, images) and automatically:

1. Extracts text via OCR (with a two-stage fallback: direct PDF text extraction, then Tesseract OCR for scanned/image-based documents)
2. Classifies document type (invoice, resume, contract, etc.)
3. Extracts structured data and tables
4. Generates embeddings and chunks content for semantic search
5. Enables chat-based Q&A over documents using RAG (Retrieval-Augmented Generation)
6. Detects and redacts PII (emails, phone numbers, Aadhaar numbers, etc.)
7. Supports document comparison (textual diff + semantic similarity)
8. Provides full multi-tenant RBAC (role-based access control) with custom roles
9. Tracks all actions via an audit log
10. Runs scheduled retention/expiry policies for document lifecycle management

## Core Features

- **Auth & Multi-tenancy** — JWT-based auth, organization-scoped data isolation, invite-based onboarding (email via Resend)
- **RBAC** — Built-in roles (Admin, Analyst, Viewer) plus fully custom roles with granular permissions
- **Document Processing** — Upload → OCR → classification → table extraction → embedding → chunking, all as an async pipeline
- **Search** — Keyword and semantic (vector similarity via pgvector) search across an organization's documents, with filters (document type, date range, tags)
- **Chat / RAG** — Ask natural-language questions about documents; answers grounded in retrieved chunks via Groq LLM inference
- **Document Comparison** — Textual diff and semantic (cosine similarity) comparison between two documents
- **PII Detection & Redaction** — Scans for and redacts sensitive information (emails, phone numbers, Aadhaar numbers) with configurable redaction types
- **Folders & Tags** — Organize documents with folders and multi-tag support
- **Notifications & Activity Feed** — In-app notifications and an organization-wide activity log
- **Audit Log** — Immutable record of all significant actions (uploads, deletes, role changes, invites)
- **Analytics Dashboard** — Organization-level usage and document statistics
- **Retention Policies** — Scheduled (Celery Beat) job to expire and clean up documents per configured retention rules

## Test Coverage

- **104 backend tests** (pytest) — covering auth, RBAC, custom roles, document CRUD, exports, organizations/invites, PII detection, search filters, tenant isolation, and document versioning
- **15 Playwright E2E tests** (frontend)
- **GitHub Actions CI** — runs the full backend test suite and frontend build on every push

---

## Tech Stack

**Backend**
- FastAPI (Python 3.12)
- PostgreSQL with `pgvector` extension (vector similarity search)
- Redis (caching / Celery broker)
- Celery + Celery Beat (async task processing, scheduled jobs)
- SQLAlchemy (ORM)
- spaCy (NLP / entity extraction)
- HuggingFace Transformers (`sentence-transformers/all-MiniLM-L6-v2` for embeddings; zero-shot classification for document typing)
- Groq API (`llama-3.1-8b-instant`) for RAG chat inference
- Tesseract OCR + pdfplumber (text/table extraction)
- Resend (transactional email)

**Frontend**
- React + Vite
- Tailwind CSS
- Recharts (analytics visualizations)

**Infra / DevOps**
- Docker Compose (4 services: `api`, `celery_worker`, `db`, `redis`) for local development
- GitHub Actions (CI)
- **Production deployment:** Render (API), Neon (Postgres + pgvector), Upstash (Redis), Vercel (frontend) — see below

---

## Architecture & Design Decisions

A few notable engineering decisions made during this project, particularly around making the app deployable on genuinely free infrastructure:

### Environment-gated fallbacks instead of a full free-tier rewrite

Rather than stripping out Celery or the ML classification pipeline to fit free-tier memory limits, the app uses config flags to run a **leaner code path in production while keeping the full architecture intact and testable locally**:

- **`USE_CELERY`** (`true` locally / `false` in production) — when `false`, async document processing (OCR, embedding, classification) runs via FastAPI's `BackgroundTasks` in-process instead of being dispatched to a Celery worker. This avoids needing a separate, paid background-worker service on Render's free tier, while the full Celery + Redis + worker implementation remains the default locally and is fully covered by tests.
- **`USE_ZERO_SHOT_CLASSIFIER`** (`true` locally / `false` in production) — when `false`, the app skips loading the zero-shot cross-encoder model (`cross-encoder/nli-MiniLM2-L6-H768`) used for ML-based document type classification, and falls back to the pre-existing rule-based keyword classifier instead. This was the single biggest lever for fitting inside Render's 512MB free-tier memory limit.

Both flags default to the full-featured path (`true`) and only change behavior when explicitly set — so the local/Docker experience, and all 104 tests, are unaffected by these production-only fallbacks.

### Database connection resilience

Neon's serverless Postgres suspends its compute after inactivity to save resources. The SQLAlchemy engine is configured with `pool_pre_ping=True` and `pool_recycle=300` so that stale connections (from a suspended-then-resumed database) are transparently detected and replaced, rather than surfacing as a `SSL connection has been closed unexpectedly` error to the user.

### Known, accepted limitations

- **Bulk/large uploads on the free-tier deployment** can exceed the 512MB container memory limit, since the embedding model (`transformers` + `torch`) has a substantial baseline memory footprint even before processing a document. This is a direct consequence of running local ML inference on a memory-constrained free host — the architecture supports swapping to a hosted inference API (e.g., HuggingFace's Inference API) to remove this constraint entirely, which was scoped but deliberately not implemented, as the time/cost tradeoff wasn't justified for a portfolio deployment (documented here rather than hidden).
- **Uploaded files aren't deleted from disk on document delete** — only the database record is removed. Noted as a known gap, not yet fixed.
- **MiniLM embeddings show 40-65% confidence/similarity scores naturally** — this is expected model behavior for this embedding size, not a bug.
- **Groq free tier** has a 6,000 tokens/minute rate limit; the chat feature includes retry logic and a friendly fallback message for when this is hit.

---

## Running Locally

### Prerequisites
- Docker Desktop
- Node.js (for frontend dev outside Docker, if desired)

### Setup

```bash
git clone https://github.com/suyashisingh/DocIntel.git
cd DocIntel
docker-compose up --build
```

This starts all four services:
- `api` — FastAPI backend on `http://localhost:8000`
- `celery_worker` — async task processing
- `db` — PostgreSQL with pgvector on port `5433`
- `redis` — Redis on default port

Frontend (separate terminal):
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

### Environment Variables

Copy `.env.example` to `.env` and fill in:
- `GROQ_API_KEY` — for RAG chat inference
- `HF_API_TOKEN` / `HF_TOKEN` — HuggingFace API token
- `RESEND_API_KEY` — for transactional emails (invites)
- `SECRET_KEY` — JWT signing secret (generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`)

### Running Tests

```bash
python -m pytest tests/ -v
```
(104 tests, requires the `db` container running)

---

## Deployment

The production deployment uses entirely free-tier services:

| Component | Service | Notes |
|---|---|---|
| Backend API | [Render](https://render.com) (free Web Service) | Spins down after 15 min inactivity; cold start ~30-60s |
| Database | [Neon](https://neon.tech) (free tier, permanent) | Postgres with pgvector extension enabled |
| Redis | [Upstash](https://upstash.com) (free tier, permanent) | Used for caching; not used as Celery broker in production (see `USE_CELERY` above) |
| Frontend | [Vercel](https://vercel.com) (free tier) | Auto-deploys from `main` branch |

See [Architecture & Design Decisions](#architecture--design-decisions) above for the reasoning behind the production-specific configuration.

---

## Project Context

Built solo as a BTech IT final-year capstone project at Manipal Institute of Technology, developed alongside an internship at Valuefy Technologies Pvt. Ltd., Mumbai. Includes full academic documentation (project report, internship diary) covering the design, implementation, and deployment process.

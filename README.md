# DocIntel

[![Tests](https://github.com/suyashisingh/DocIntel/actions/workflows/tests.yml/badge.svg)](https://github.com/suyashisingh/DocIntel/actions/workflows/tests.yml)

AI-powered document intelligence platform with multi-tenant organization support — upload documents, extract structured data via OCR/NLP/ML, search across content and tables, and chat with your documents using retrieval-augmented generation.

## Tech stack

**Backend** — FastAPI, Celery + Redis, PostgreSQL + pgvector, SQLAlchemy, Alembic, spaCy, sentence-transformers, HuggingFace Transformers, Tesseract OCR

**Frontend** — React 19, Vite, Tailwind CSS, React Router, Framer Motion

**Testing** — pytest (backend), Playwright (end-to-end)

**CI** — GitHub Actions (`.github/workflows/tests.yml`): backend pytest suite against a Postgres+pgvector service container, frontend production build check

## Getting started

See [`CLAUDE.md`](./CLAUDE.md) for local development commands (running the API server, Celery worker, database migrations, and tests).

import json
import logging
import os
import time
from typing import Optional

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_table import DocumentTable
from app.services.embedding_service import get_embedding

logger = logging.getLogger(__name__)


def generate_summary(text: str) -> str | None:
    if not text or len(text) < 100:
        return None

    prompt = (
        "Summarize the following document in 2-3 sentences. "
        "Be concise and focus on the key information.\n"
        f"Document: {text[:3000]}"
    )

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 256,
            },
            timeout=30,
        )
        if response.status_code != 200:
            logger.warning("Groq summary error %d: %s", response.status_code, response.text)
            return None
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Summary generation failed: %s", e)
        return None


def generate_suggested_questions(text: str, doc_type: str) -> list[str]:
    if not text or len(text) < 100:
        return []

    prompt = (
        "Given this document excerpt, generate exactly 5 short, specific questions "
        "a user might want to ask about it. Return ONLY a JSON array of 5 strings, "
        "no other text, no markdown.\n"
        f"Document type: {doc_type}\n"
        f"Document excerpt: {text[:2000]}"
    )

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 256,
            },
            timeout=5,
        )
        if response.status_code != 200:
            logger.warning("Groq suggested questions error %d: %s", response.status_code, response.text)
            return []
        content = response.json()["choices"][0]["message"]["content"]
        questions = json.loads(content)
        if isinstance(questions, list):
            return [str(q) for q in questions[:5]]
        return []
    except Exception as e:
        logger.warning("Suggested questions generation failed: %s", e)
        return []


def search_similar_chunks(
    db: Session,
    query: str,
    org_id: int,
    document_id: Optional[int] = None,
    top_k: int = 3,
) -> list[tuple[DocumentChunk, float]]:
    """Return the *top_k* chunks closest to *query*, with their cosine distances."""
    query_embedding = get_embedding(query)
    dist_col = DocumentChunk.embedding.cosine_distance(query_embedding).label("dist")

    q = db.query(DocumentChunk, dist_col).filter(DocumentChunk.org_id == org_id)
    if document_id is not None:
        q = q.filter(DocumentChunk.document_id == document_id)

    return (
        q.order_by(dist_col)
        .limit(top_k)
        .all()
    )


def search_similar_tables(
    db: Session,
    query: str,
    org_id: int,
    document_id: Optional[int] = None,
    source_doc_ids: Optional[list] = None,
    top_k: int = 3,
) -> list[DocumentTable]:
    """Return the *top_k* tables closest to *query* by cosine similarity."""
    query_embedding = get_embedding(query)

    q = (
        db.query(DocumentTable)
        .join(Document, Document.id == DocumentTable.document_id)
        .filter(
            Document.organization_id == org_id,
            DocumentTable.embedding.isnot(None),
        )
    )
    if document_id is not None:
        q = q.filter(DocumentTable.document_id == document_id)
    elif source_doc_ids:
        q = q.filter(DocumentTable.document_id.in_(source_doc_ids))

    return (
        q.order_by(DocumentTable.embedding.cosine_distance(query_embedding))
        .limit(top_k)
        .all()
    )


CHUNK_CONTEXT_CHAR_LIMIT = 400
REDUCED_CHUNK_COUNT = 2
RATE_LIMIT_RETRY_DELAY_SECONDS = 2
HIGH_DEMAND_MESSAGE = "I'm currently handling high demand. Please wait a few seconds and try again."
GENERIC_FAILURE_MESSAGE = "I was unable to generate an answer at this time. Please try again later."


def _build_prompt_and_sources(question, chunks, tables, table_doc_names):
    from app.services.table_extraction_service import table_to_markdown

    context_parts = []
    sources = []

    if chunks:
        context_parts.append("\n---\n".join(c.chunk_text[:CHUNK_CONTEXT_CHAR_LIMIT] for c in chunks))
        sources = [
            {
                "document_id": c.document_id,
                "chunk_index": c.chunk_index,
                "chunk_text": c.chunk_text[:200],
            }
            for c in chunks
        ]

    if tables:
        table_doc_names = table_doc_names or {}
        table_sections = []
        for t in tables:
            doc_name = table_doc_names.get(t.document_id, f"Document #{t.document_id}")
            tbl_dict = {
                "headers": t.headers,
                "rows": t.rows,
                "row_count": t.row_count,
                "column_count": t.column_count,
            }
            md = table_to_markdown(tbl_dict)
            table_sections.append(f"Table on page {t.page_number} of {doc_name}:\n{md}")
            sources.append({
                "type": "table",
                "table_id": t.id,
                "document_id": t.document_id,
                "page": t.page_number,
                "preview": {
                    "headers": t.headers,
                    "rows": (t.rows or [])[:5],
                    "row_count": t.row_count,
                    "column_count": t.column_count,
                },
            })
        context_parts.append("\n\n".join(table_sections))

    context = "\n\n".join(context_parts)

    prompt = f"""Answer the question based only on the provided document excerpts and tables.
If the answer is not in the context, say so clearly.

Context:
{context}

Question: {question}
Answer:"""

    return prompt, sources


def _call_groq_chat(prompt: str, max_tokens: int = 1024, timeout: int = 30):
    return requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
            "Content-Type": "application/json",
        },
        json={
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
        },
        timeout=timeout,
    )


def _get_groq_completion(question, chunks, tables, table_doc_names):
    """Call Groq with retry/fallback handling:

    - 429 (rate limited): wait briefly and retry once with the same request.
    - 413 (payload too large): retry once with fewer chunks before giving up.

    Never raises — always returns a (answer_text, sources) pair, falling back
    to a friendly message on repeated failure so the endpoint never crashes.
    """
    remaining_chunks = chunks
    rate_limited_once = False
    reduced_once = False

    while True:
        prompt, sources = _build_prompt_and_sources(question, remaining_chunks, tables, table_doc_names)

        try:
            response = _call_groq_chat(prompt)
        except Exception as e:
            logger.warning("Groq request failed: %s", e)
            return GENERIC_FAILURE_MESSAGE, sources

        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"], sources

        if response.status_code == 429 and not rate_limited_once:
            logger.warning("Groq rate limited (429) — retrying once in %ds.", RATE_LIMIT_RETRY_DELAY_SECONDS)
            rate_limited_once = True
            time.sleep(RATE_LIMIT_RETRY_DELAY_SECONDS)
            continue

        if response.status_code == 429:
            logger.warning("Groq still rate limited after retry — returning high-demand message.")
            return HIGH_DEMAND_MESSAGE, sources

        if response.status_code == 413 and not reduced_once and len(remaining_chunks) > REDUCED_CHUNK_COUNT:
            logger.warning("Groq payload too large (413) — retrying with %d chunks.", REDUCED_CHUNK_COUNT)
            reduced_once = True
            rate_limited_once = False  # give the smaller payload its own rate-limit retry
            remaining_chunks = remaining_chunks[:REDUCED_CHUNK_COUNT]
            continue

        logger.warning("Groq error %d: %s", response.status_code, response.text)
        return GENERIC_FAILURE_MESSAGE, sources


def generate_answer(
    question: str,
    chunks: list,
    tables: Optional[list] = None,
    table_doc_names: Optional[dict] = None,
) -> dict:
    tables = tables or []

    if not chunks and not tables:
        return {
            "answer": "I couldn't find relevant information in your documents.",
            "sources": [],
        }

    answer, sources = _get_groq_completion(question, chunks, tables, table_doc_names)
    return {"answer": answer, "sources": sources}

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.chat_message import ChatMessage
from app.models.organization_user import OrganizationUser
from app.models.user import User
from app.models.document import Document
from app.services.chat_service import generate_answer, search_similar_chunks, search_similar_tables
from app.auth.rbac import check_permission

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


class ChatQuery(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    document_id: Optional[int] = None


def _get_membership(db: Session, user_id: int) -> OrganizationUser:
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.user_id == user_id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of any organization")
    return membership


@router.post("/query")
def chat_query(
    body: ChatQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not settings.HF_API_TOKEN:
        raise HTTPException(status_code=503, detail="Chat feature not configured")

    membership = _get_membership(db, current_user.id)
    org_id = membership.organization_id

    if not check_permission(db, current_user, org_id, "chat", "use"):
        raise HTTPException(status_code=403, detail="Requires permission: chat.use")

    chunk_results = search_similar_chunks(db, body.question, org_id, body.document_id)
    chunks = [c for c, _ in chunk_results]
    distances = [d for _, d in chunk_results]

    # pgvector cosine_distance ∈ [0, 2]; convert to similarity ∈ [0, 1].
    # Weighted blend: best chunk dominates (70%) but the mean of the top-3
    # closest chunks moderates overconfidence when only one chunk is close.
    if distances:
        sorted_d = sorted(distances)
        best = 1.0 - sorted_d[0] / 2.0
        top3 = sorted_d[:3]
        mean_top3 = 1.0 - (sum(top3) / len(top3)) / 2.0
        confidence_score = 0.7 * best + 0.3 * mean_top3
    else:
        confidence_score = 0.0

    # Thresholds calibrated for all-MiniLM-L6-v2: relevant pairs cluster 0.6-0.85
    if confidence_score < 0.45:
        confidence_level = "low"
    elif confidence_score < 0.65:
        confidence_level = "medium"
    else:
        confidence_level = "high"

    try:
        source_doc_ids = (
            list({c.document_id for c in chunks})
            if chunks and body.document_id is None
            else None
        )
        tables = search_similar_tables(
            db, body.question, org_id, body.document_id, source_doc_ids
        )
        table_doc_names: dict = {}
        for t in tables:
            if t.document_id not in table_doc_names:
                doc = db.query(Document).filter(Document.id == t.document_id).first()
                table_doc_names[t.document_id] = (
                    doc.original_filename or f"Document #{t.document_id}"
                    if doc else f"Document #{t.document_id}"
                )
    except Exception:
        logger.warning("Table search failed (non-fatal), proceeding without tables")
        tables = []
        table_doc_names = {}

    result = generate_answer(body.question, chunks, tables, table_doc_names)
    answer = result["answer"]

    msg = ChatMessage(
        org_id=org_id,
        user_id=current_user.id,
        document_id=body.document_id,
        question=body.question,
        answer=answer,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    if body.document_id is not None:
        try:
            from app.models.document_qa import DocumentQA
            qa = DocumentQA(
                document_id=body.document_id,
                user_id=current_user.id,
                question=body.question,
                answer=answer,
            )
            db.add(qa)
            db.commit()
        except Exception:
            logger.warning("Failed to save document QA record (non-fatal)")
            try:
                db.rollback()
            except Exception:
                pass

    logger.info(
        "Chat query: user_id=%d org_id=%d doc_id=%s chunks=%d confidence=%s score=%.3f",
        current_user.id, org_id, body.document_id, len(chunks), confidence_level, confidence_score,
    )

    return {
        "answer": answer,
        "sources": result["sources"],
        "message_id": msg.id,
        "confidence_score": round(confidence_score, 4),
        "confidence_level": confidence_level,
    }


@router.get("/history")
def chat_history(
    document_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = _get_membership(db, current_user.id)

    q = db.query(ChatMessage).filter(
        ChatMessage.org_id == membership.organization_id
    )
    if document_id is not None:
        q = q.filter(ChatMessage.document_id == document_id)

    messages = q.order_by(ChatMessage.created_at.desc()).limit(limit).all()

    return [
        {
            "id": m.id,
            "question": m.question,
            "answer": m.answer,
            "document_id": m.document_id,
            "created_at": m.created_at,
        }
        for m in messages
    ]

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.auth.dependencies import get_current_user
from app.auth.rbac import check_permission
from app.comparison_tasks import run_comparison
from app.database import SessionLocal, get_db
from app.models.comparison import Comparison
from app.models.document import Document
from app.models.organization_user import OrganizationUser
from app.models.user import User

router = APIRouter(prefix="/comparisons", tags=["Comparisons"])
logger = logging.getLogger(__name__)


class CreateComparisonRequest(BaseModel):
    doc_a_id: int
    doc_b_id: int
    mode: str


def _serialize(c: Comparison) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "doc_a_id": c.doc_a_id,
        "doc_b_id": c.doc_b_id,
        "mode": c.mode,
        "status": c.status,
        "result": c.result,
        "summary": c.summary,
        "similarity_score": c.similarity_score,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
    }


@router.post("")
def create_comparison(
    body: CreateComparisonRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.mode not in ("textual", "semantic"):
        raise HTTPException(status_code=400, detail="mode must be 'textual' or 'semantic'")

    if body.doc_a_id == body.doc_b_id:
        raise HTTPException(status_code=400, detail="doc_a_id and doc_b_id must be different")

    doc_a = db.query(Document).filter(Document.id == body.doc_a_id).first()
    doc_b = db.query(Document).filter(Document.id == body.doc_b_id).first()

    if not doc_a or not doc_b:
        raise HTTPException(status_code=404, detail="One or both documents not found")

    for doc in (doc_a, doc_b):
        membership = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == doc.organization_id,
            OrganizationUser.user_id == current_user.id,
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied to one of the documents")
        if not check_permission(db, current_user, doc.organization_id, "compare", "use"):
            raise HTTPException(status_code=403, detail="Requires permission: compare.use")

    comparison = Comparison(
        user_id=current_user.id,
        doc_a_id=body.doc_a_id,
        doc_b_id=body.doc_b_id,
        mode=body.mode,
        status="pending",
    )
    db.add(comparison)
    db.commit()
    db.refresh(comparison)

    run_comparison.delay(comparison.id)

    logger.info("Comparison %d created (mode=%s)", comparison.id, body.mode)
    return _serialize(comparison)


@router.get("")
def list_comparisons(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = (
        db.query(Comparison)
        .filter(Comparison.user_id == current_user.id)
        .count()
    )
    items = (
        db.query(Comparison)
        .filter(Comparison.user_id == current_user.id)
        .order_by(Comparison.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"total": total, "items": [_serialize(c) for c in items]}


@router.get("/{comparison_id}")
def get_comparison(
    comparison_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comparison = (
        db.query(Comparison)
        .filter(
            Comparison.id == comparison_id,
            Comparison.user_id == current_user.id,
        )
        .first()
    )
    if not comparison:
        raise HTTPException(status_code=404, detail="Comparison not found")
    return _serialize(comparison)


@router.websocket("/ws/{comparison_id}/status")
async def comparison_status_ws(websocket: WebSocket, comparison_id: int):
    await websocket.accept()

    db = SessionLocal()
    try:
        comparison = db.query(Comparison).filter(Comparison.id == comparison_id).first()
        if not comparison:
            await websocket.send_text(json.dumps({
                "comparison_id": comparison_id,
                "status": "not_found",
                "progress": 0,
                "message": "Comparison not found",
            }))
            await websocket.close()
            return
        status_val = comparison.status
    finally:
        db.close()

    if status_val in ("completed", "failed"):
        await websocket.send_text(json.dumps({
            "comparison_id": comparison_id,
            "status": status_val,
            "progress": 100 if status_val == "completed" else 0,
            "message": "Comparison complete" if status_val == "completed" else "Comparison failed",
        }))
        await websocket.close()
        return

    r = aioredis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))
    pubsub = r.pubsub()
    await pubsub.subscribe(f"comparison:{comparison_id}")
    logger.debug("WS subscribed to comparison:%d", comparison_id)

    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                await asyncio.sleep(0)
                continue
            data = msg["data"]
            text = data if isinstance(data, str) else data.decode()
            try:
                await websocket.send_text(text)
            except WebSocketDisconnect:
                break
            payload = json.loads(text)
            if payload.get("status") in ("completed", "failed"):
                break
    except WebSocketDisconnect:
        logger.debug("WS client disconnected for comparison %d", comparison_id)
    except Exception:
        logger.exception("WS handler error for comparison %d", comparison_id)
    finally:
        await pubsub.unsubscribe(f"comparison:{comparison_id}")
        await r.aclose()

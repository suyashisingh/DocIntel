import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.models.document import Document

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/documents/{document_id}/status")
async def document_status_ws(websocket: WebSocket, document_id: int):
    await websocket.accept()

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            await websocket.send_text(json.dumps({
                "document_id": document_id, "status": "not_found",
                "progress": 0, "message": "Document not found",
            }))
            await websocket.close()
            return
        status_val = doc.status.value
    finally:
        db.close()

    # Already terminal — send snapshot and close.
    if status_val in ("completed", "failed"):
        await websocket.send_text(json.dumps({
            "document_id": document_id,
            "status": status_val,
            "progress": 100 if status_val == "completed" else 0,
            "message": "Processing complete" if status_val == "completed" else "Processing failed",
        }))
        await websocket.close()
        return

    r = aioredis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))
    pubsub = r.pubsub()
    await pubsub.subscribe(f"doc_status:{document_id}")
    logger.debug("WS subscribed to doc_status:%d", document_id)

    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                # No message yet — yield to the event loop and retry.
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
        logger.debug("WS client disconnected for document %d", document_id)
    except Exception:
        logger.exception("WS handler error for document %d", document_id)
    finally:
        await pubsub.unsubscribe(f"doc_status:{document_id}")
        await r.aclose()

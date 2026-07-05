import logging
import os
import numpy as np
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.document_chunk import DocumentChunk

logger = logging.getLogger(__name__)

HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_tokenizer = None
_model = None

def _load_model():
    global _tokenizer, _model
    if _tokenizer is None:
        from transformers import AutoTokenizer, AutoModel
        import torch
        _tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL)
        _model = AutoModel.from_pretrained(EMBEDDING_MODEL)
        _model.eval()
    return _tokenizer, _model

def get_embedding(text: str) -> list[float]:
    import torch
    import torch.nn.functional as F
    tokenizer, model = _load_model()
    inputs = tokenizer(text, return_tensors="pt", truncation=True,
                       max_length=512, padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
    # Mean pool the token embeddings
    attention_mask = inputs["attention_mask"]
    token_embeddings = outputs.last_hidden_state
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(
        token_embeddings.size()).float()
    embedding = torch.sum(token_embeddings * input_mask_expanded, 1) / \
                torch.clamp(input_mask_expanded.sum(1), min=1e-9)
    # L2-normalize so dot-product == cosine similarity and pgvector
    # doesn't need to recompute norms at query time.
    embedding = F.normalize(embedding, p=2, dim=1)
    return embedding[0].numpy().tolist()

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(" ".join(words[start:end]))
        start += chunk_size - overlap
    return chunks

def embed_document(document_id: int, org_id: int, text: str):
    if not text or not text.strip():
        logger.warning("Document %d: empty text, skipping embedding", document_id)
        return

    db: Session = SessionLocal()
    try:
        chunks = chunk_text(text)
        db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).delete()
        db.commit()

        for i, chunk in enumerate(chunks):
            try:
                embedding = get_embedding(chunk)
                db.add(DocumentChunk(
                    document_id=document_id,
                    org_id=org_id,
                    chunk_index=i,
                    chunk_text=chunk,
                    embedding=embedding
                ))
            except Exception as e:
                logger.warning("Chunk %d embedding failed: %s", i, e)
                continue

        db.commit()
        logger.info("Document %d: embedded %d chunks", document_id, len(chunks))
    except Exception as e:
        logger.warning("embed_document failed: %s", e)
        db.rollback()
        raise
    finally:
        db.close()

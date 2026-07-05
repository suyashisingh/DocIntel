import difflib
import logging
import os

import numpy as np
import requests

logger = logging.getLogger(__name__)


def compare_textual(text_a: str, text_b: str) -> dict:
    lines_a = text_a.splitlines(keepends=True)
    lines_b = text_b.splitlines(keepends=True)

    matcher = difflib.SequenceMatcher(None, lines_a, lines_b)
    ratio = round(matcher.ratio(), 4)

    added = removed = unchanged = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            unchanged += i2 - i1
        elif tag == "insert":
            added += j2 - j1
        elif tag == "delete":
            removed += i2 - i1
        elif tag == "replace":
            removed += i2 - i1
            added += j2 - j1

    raw_diff = list(difflib.unified_diff(lines_a, lines_b, lineterm=""))

    hunks = []
    current_hunk = None
    for line in raw_diff:
        if line.startswith("@@"):
            if current_hunk is not None:
                hunks.append(current_hunk)
            current_hunk = {"header": line, "lines": []}
        elif current_hunk is not None:
            current_hunk["lines"].append(line)
    if current_hunk is not None:
        hunks.append(current_hunk)

    return {
        "stats": {
            "added": added,
            "removed": removed,
            "unchanged": unchanged,
            "ratio": ratio,
        },
        "hunks": hunks,
    }


def compare_semantic(
    chunks_a: list,
    embeddings_a: list,
    chunks_b: list,
    embeddings_b: list,
) -> dict:
    if not embeddings_a and not embeddings_b:
        return {
            "overall_similarity": 1.0,
            "pairings": [],
            "stats": {"matched": 0, "modified": 0, "added": 0, "removed": 0},
        }

    if not embeddings_a:
        return {
            "overall_similarity": 0.0,
            "pairings": [
                {"chunk_a": None, "chunk_b": c, "similarity": 0.0, "status": "added"}
                for c in chunks_b
            ],
            "stats": {
                "matched": 0,
                "modified": 0,
                "added": len(chunks_b),
                "removed": 0,
            },
        }

    if not embeddings_b:
        return {
            "overall_similarity": 0.0,
            "pairings": [
                {"chunk_a": c, "chunk_b": None, "similarity": 0.0, "status": "removed"}
                for c in chunks_a
            ],
            "stats": {
                "matched": 0,
                "modified": 0,
                "added": 0,
                "removed": len(chunks_a),
            },
        }

    arr_a = np.array(embeddings_a, dtype=np.float32)
    arr_b = np.array(embeddings_b, dtype=np.float32)

    norms_a = np.linalg.norm(arr_a, axis=1, keepdims=True)
    norms_b = np.linalg.norm(arr_b, axis=1, keepdims=True)
    norm_a = arr_a / np.where(norms_a > 0, norms_a, 1.0)
    norm_b = arr_b / np.where(norms_b > 0, norms_b, 1.0)

    sim_matrix = norm_a @ norm_b.T  # (len_a, len_b)

    pairings = []
    matched_b: set[int] = set()

    for i, chunk_a_text in enumerate(chunks_a):
        best_j = int(np.argmax(sim_matrix[i]))
        best_sim = float(sim_matrix[i, best_j])

        if best_sim >= 0.85:
            status = "matched"
            matched_b.add(best_j)
        elif best_sim >= 0.65:
            status = "modified"
            matched_b.add(best_j)
        else:
            status = "removed"
            best_j = None  # type: ignore[assignment]

        pairings.append(
            {
                "chunk_a": chunk_a_text,
                "chunk_b": chunks_b[best_j] if best_j is not None else None,
                "similarity": round(best_sim, 4),
                "status": status,
            }
        )

    for j, chunk_b_text in enumerate(chunks_b):
        if j not in matched_b:
            pairings.append(
                {
                    "chunk_a": None,
                    "chunk_b": chunk_b_text,
                    "similarity": 0.0,
                    "status": "added",
                }
            )

    stats = {
        "matched": sum(1 for p in pairings if p["status"] == "matched"),
        "modified": sum(1 for p in pairings if p["status"] == "modified"),
        "added": sum(1 for p in pairings if p["status"] == "added"),
        "removed": sum(1 for p in pairings if p["status"] == "removed"),
    }

    total = max(len(chunks_a), len(chunks_b))
    overall_similarity = (
        round(sum(p["similarity"] for p in pairings) / total, 4) if total > 0 else 1.0
    )

    return {
        "overall_similarity": overall_similarity,
        "pairings": pairings,
        "stats": stats,
    }


def generate_change_summary(pairings: list) -> str | None:
    interesting = [
        p for p in pairings if p["status"] in ("modified", "added", "removed")
    ][:15]

    if not interesting:
        return None

    lines = []
    for p in interesting:
        if p["status"] == "modified":
            a_preview = (p["chunk_a"] or "")[:100].replace("\n", " ")
            b_preview = (p["chunk_b"] or "")[:100].replace("\n", " ")
            lines.append(f"- MODIFIED: '{a_preview}' → '{b_preview}'")
        elif p["status"] == "added":
            preview = (p["chunk_b"] or "")[:100].replace("\n", " ")
            lines.append(f"- ADDED: '{preview}'")
        elif p["status"] == "removed":
            preview = (p["chunk_a"] or "")[:100].replace("\n", " ")
            lines.append(f"- REMOVED: '{preview}'")

    prompt = (
        "Based on these document changes, write a concise markdown summary "
        "of the key differences. Write 3-5 bullet points highlighting the "
        "most important changes.\n\nChanges:\n" + "\n".join(lines)
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
                "max_tokens": 512,
            },
            timeout=30,
        )
        if response.status_code != 200:
            logger.warning("Groq summary error %d: %s", response.status_code, response.text)
            return None
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Change summary generation failed: %s", e)
        return None

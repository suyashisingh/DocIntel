from transformers import pipeline

from app.config import settings

# ---------------------------------------------------------------------------
# Configurable constants
# ---------------------------------------------------------------------------
CANDIDATE_LABELS = [
    "invoice",
    "resume",
    "contract",
    "bank_statement",
    "offer_letter",
    "generic",
]

# Cross-encoders have a 512-token limit; truncate input text to stay safe.
MAX_INPUT_CHARS = 1000


class MLDocumentClassifier:
    """Zero-shot document classifier backed by a HuggingFace NLI cross-encoder.

    Returns the top predicted label and its raw probability score (0-1).
    No training data or .joblib files required.
    """

    def __init__(self):
        if settings.USE_ZERO_SHOT_CLASSIFIER:
            self._pipeline = pipeline(
                "zero-shot-classification",
                model=settings.ZERO_SHOT_MODEL,
            )
        else:
            self._pipeline = None

    def predict(self, text: str) -> tuple[str, float]:
        """Classify *text* and return ``(label, confidence)``."""
        truncated = text[:MAX_INPUT_CHARS]
        result = self._pipeline(truncated, candidate_labels=CANDIDATE_LABELS)
        top_label: str = result["labels"][0]
        top_score: float = float(result["scores"][0])
        return top_label, top_score

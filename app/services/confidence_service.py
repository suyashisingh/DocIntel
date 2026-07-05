# ---------------------------------------------------------------------------
# Configurable weights — must sum to 1.0
# ---------------------------------------------------------------------------
WEIGHT_ML_SCORE = 0.40
WEIGHT_TEXT_QUALITY = 0.30
WEIGHT_ENTITY_RICHNESS = 0.30

# Normalisation targets (tune these without touching formulas)
TEXT_LENGTH_TARGET    = 5000  # chars; a single-page PDF ≈ 2000-3000 chars
ENTITY_COUNT_TARGET   = 25    # entities; real docs have 20-50 NER hits
ENTITY_VARIETY_TARGET = 5     # distinct entity label types
SENTENCE_COUNT_TARGET = 20    # sentences; caps sentence-structure score


def _text_quality_score(text: str) -> float:
    """Score 0-1 from three sub-components: length, word quality, sentence structure."""
    if not text:
        return 0.0

    length_score = min(len(text) / TEXT_LENGTH_TARGET, 1.0)

    words = text.split()
    if not words:
        # Only length component is meaningful; treat others as zero
        return length_score / 3

    meaningful = sum(1 for w in words if w.isalpha() and len(w) > 2)
    word_ratio_score = meaningful / len(words)

    sentence_count = len([s for s in text.split('.') if len(s.strip()) > 10])
    sentence_structure_score = min(sentence_count / SENTENCE_COUNT_TARGET, 1.0)

    return (length_score + word_ratio_score + sentence_structure_score) / 3


def _entity_richness_score(entities: list) -> float:
    """Score 0-1 based on entity count and variety of entity label types."""
    if not entities:
        return 0.0

    count_score = min(len(entities) / ENTITY_COUNT_TARGET, 1.0)

    # Support both {"label": ...} dicts (spaCy output) and plain strings.
    try:
        labels = {e["label"] for e in entities if isinstance(e, dict) and "label" in e}
    except (TypeError, KeyError):
        labels = set()

    if not labels:
        # Fall back: treat each unique string representation as its own type
        labels = {str(e) for e in entities}

    variety_score = min(len(labels) / ENTITY_VARIETY_TARGET, 1.0)

    return (count_score + variety_score) / 2


def compute_confidence(text: str, entities: list, ml_score: float) -> float:
    """Return a hybrid confidence score in [0, 1].

    Weights:
        40% — zero-shot classifier score (*ml_score*)
        30% — text quality  (length + meaningful-word ratio + sentence structure)
        30% — entity richness (count + label variety)
    """
    text_quality = _text_quality_score(text)
    entity_richness = _entity_richness_score(entities)

    confidence = (
        WEIGHT_ML_SCORE * ml_score
        + WEIGHT_TEXT_QUALITY * text_quality
        + WEIGHT_ENTITY_RICHNESS * entity_richness
    )
    return round(confidence, 4)

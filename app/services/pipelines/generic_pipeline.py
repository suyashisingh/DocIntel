from app.services.ocr_service import extract_text_from_document
from app.services.nlp_service import extract_entities

# Normalisation targets for the confidence heuristic
_TEXT_LENGTH_TARGET = 500   # characters; docs longer than this score >= 0.5 on length
_ENTITY_COUNT_TARGET = 10   # entities


def run_generic_pipeline(file_path: str) -> tuple[dict, float]:
    """Extract text and entities from a document of unknown type.

    Returns a tuple of (extracted_data dict, confidence_score 0-1).
    Confidence is a simple average of normalised text length and entity density —
    no fixed magic numbers.
    """
    text = extract_text_from_document(file_path)
    entities = extract_entities(text)

    extracted_data = {
        "document_type": "generic",
        "text_length": len(text),
        "entities": entities[:20],
    }

    text_score = min(len(text) / _TEXT_LENGTH_TARGET, 1.0)
    entity_score = min(len(entities) / _ENTITY_COUNT_TARGET, 1.0)
    confidence_score = round((text_score + entity_score) / 2, 4)

    return extracted_data, confidence_score

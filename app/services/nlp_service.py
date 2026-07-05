import spacy

from app.config import settings

nlp = spacy.load(settings.SPACY_MODEL)


def extract_entities(text: str):

    doc = nlp(text)

    entities = []

    for ent in doc.ents:
        entities.append({
            "text": ent.text,
            "label": ent.label_
        })

    return entities

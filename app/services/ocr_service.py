import logging

import pytesseract
from PIL import Image
import pdfplumber

from app.config import settings

pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_PATH

logger = logging.getLogger(__name__)


def extract_text_from_document(file_path: str) -> str:

    if file_path.lower().endswith(".pdf"):
        return extract_text_from_pdf(file_path)

    return extract_text_from_image(file_path)


def extract_text_from_pdf(file_path: str) -> str:

    # Step 1: Try direct text extraction with pdfplumber
    direct_text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                direct_text += page_text + "\n"
    except Exception as e:
        logger.warning(f"pdfplumber direct extraction failed: {e}")

    # If we got meaningful text (>100 chars per page average), use it
    if len(direct_text.strip()) > 100:
        logger.info(f"Direct extraction got {len(direct_text)} chars")
        return direct_text

    # Step 2: Fall back to real OCR via pdf2image + pytesseract
    logger.info(f"Direct extraction returned {len(direct_text.strip())} chars, falling back to OCR")
    ocr_text = ""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(file_path, dpi=200)
        for i, image in enumerate(images):
            page_text = pytesseract.image_to_string(image)
            ocr_text += page_text + "\n"
            logger.info(f"OCR page {i+1}: {len(page_text)} chars")
    except Exception as e:
        logger.error(f"OCR fallback failed: {e}")
        return ""

    logger.info(f"OCR extraction got {len(ocr_text)} chars")
    return ocr_text


def extract_text_from_image(file_path: str) -> str:

    image = Image.open(file_path)

    text = pytesseract.image_to_string(image)

    return text

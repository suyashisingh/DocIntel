import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self):
        self.DATABASE_URL = os.getenv("DATABASE_URL")
        self.SECRET_KEY = os.getenv("SECRET_KEY")
        self.ALGORITHM = os.getenv("ALGORITHM", "HS256")
        self.ACCESS_TOKEN_EXPIRE_MINUTES = int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30)
        )
        self.LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

        # CORS — comma-separated list of allowed origins.
        # Example: ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
        self.ALLOWED_ORIGINS: list[str] = [
            o.strip()
            for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
            if o.strip()
        ]

        # File upload constraints
        self.MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", 10))
        self.ALLOWED_EXTENSIONS: set[str] = {
            ext.strip().lower()
            for ext in os.getenv(
                "ALLOWED_EXTENSIONS", "pdf,png,jpg,jpeg,tiff,zip"
            ).split(",")
            if ext.strip()
        }

        # Storage
        self.UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "storage/documents")

        # Email (Resend)
        self.RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
        self.RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "DocIntel <onboarding@resend.dev>")
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

        # Redis / Celery
        self.CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

        # OCR
        # Default "tesseract" works on Linux/Docker (binary on PATH).
        # Override with an absolute path on Windows, e.g.:
        #   TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
        self.TESSERACT_PATH: str = os.getenv("TESSERACT_PATH", "tesseract")

        # NLP
        self.SPACY_MODEL: str = os.getenv("SPACY_MODEL", "en_core_web_sm")

        # ML classifier
        self.ZERO_SHOT_MODEL: str = os.getenv(
            "ZERO_SHOT_MODEL", "cross-encoder/nli-MiniLM2-L6-H768"
        )

        # HuggingFace Inference API (RAG / Chat)
        self.HF_API_TOKEN: str = os.getenv("HF_API_TOKEN", "")
        self.EMBEDDING_MODEL: str = os.getenv(
            "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self.CHAT_MODEL: str = os.getenv(
            "CHAT_MODEL", "mistralai/Mistral-7B-Instruct-v0.2"
        )

        # Startup validation — fail loudly rather than crashing deep in
        # JWT/database code with an unhelpful AttributeError or KeyError.
        missing = [
            name for name, val in (
                ("DATABASE_URL", self.DATABASE_URL),
                ("SECRET_KEY", self.SECRET_KEY),
            )
            if not val
        ]
        if missing:
            raise RuntimeError(
                f"Missing required environment variable(s): {', '.join(missing)}. "
                "Set them in your .env file or environment before starting the server."
            )


settings = Settings()

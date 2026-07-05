import logging
import sys

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(log_level_str: str = "INFO") -> None:
    """Configure the root logger and align uvicorn's loggers.

    Uses logging.basicConfig which is a no-op when handlers are already
    attached to the root logger, so this is safe to call from multiple
    entry points (main.py and Celery workers via ai_pipeline.py).
    """
    log_level = getattr(logging, log_level_str.upper(), logging.INFO)

    logging.basicConfig(
        level=log_level,
        format=_LOG_FORMAT,
        datefmt=_DATE_FORMAT,
        stream=sys.stdout,
    )

    # Align uvicorn's own loggers with the app-wide level so all output
    # shares the same format and is not suppressed or double-emitted.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(log_level)

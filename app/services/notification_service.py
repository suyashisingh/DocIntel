import logging
from sqlalchemy.orm import Session

from app.models.notification import Notification

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    ntype: str = "info",
    link: str | None = None,
) -> None:
    if not user_id:
        return
    try:
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            link=link,
        )
        db.add(notif)
        db.commit()
        logger.info("Notification user=%d type=%s title=%r", user_id, ntype, title)
    except Exception:
        logger.warning("Failed to create notification for user %d", user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass

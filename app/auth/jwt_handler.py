from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.config import settings


def create_access_token(data: dict):
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({"exp": expire})

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )


def create_invite_token(email: str, org_id: int, role: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode(
        {"email": email, "org_id": org_id, "role": role, "exp": expire, "type": "invite"},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_invite_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as e:
        raise ValueError(f"Invalid invite token: {e}") from e
    if payload.get("type") != "invite":
        raise ValueError("Not an invite token")
    return payload
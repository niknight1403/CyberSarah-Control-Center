"""Authentifizierungs-Service: JWT-Erstellung/-Validierung, Passwort-Hashing."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from loguru import logger

from app.settings import settings

# ─── Passwort-Hashing (bcrypt, automatisch gecached) ────────────
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)


def hash_password(password: str) -> str:
    """Hash ein Passwort mit bcrypt (12 Runden)."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Prüft ein Passwort gegen den bcrypt-Hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ─── JWT-Tokens ─────────────────────────────────────────────────
def create_access_token(
    user_id: str,
    role: str = "user",
    expires_delta: Optional[timedelta] = None,
) -> tuple[str, int]:
    """Erstellt einen JWT-Access-Token.
    
    Returns:
        Tuple aus (token_string, expires_in_sekunden)
    """
    expire_minutes = expires_delta or timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    expires_in = int(expire_minutes.total_seconds())
    expire_at = datetime.now(timezone.utc) + expire_minutes

    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": expire_at,
        "jti": str(uuid.uuid4()),
    }

    token = jwt.encode(
        payload,
        settings.jwt_secret_key_bytes,
        algorithm=settings.JWT_ALGORITHM,
    )
    return token, expires_in


def create_refresh_token(user_id: str) -> tuple[str, int]:
    """Erstellt einen JWT-Refresh-Token (längere Gültigkeit)."""
    expire_days = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    expires_in = int(expire_days.total_seconds())
    expire_at = datetime.now(timezone.utc) + expire_days

    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": datetime.now(timezone.utc),
        "exp": expire_at,
        "jti": str(uuid.uuid4()),
    }

    token = jwt.encode(
        payload,
        settings.jwt_secret_key_bytes,
        algorithm=settings.JWT_ALGORITHM,
    )
    return token, expires_in


def decode_token(token: str) -> dict:
    """Dekodiert und validiert einen JWT-Token.
    
    Raises:
        JWTError: Wenn Token ungültig oder abgelaufen ist.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key_bytes,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as exc:
        logger.warning(f"JWT-Decode fehlgeschlagen: {exc}")
        raise


def verify_token(token: str, expected_type: str = "access") -> dict:
    """Validiert einen Token und prüft den Typ.
    
    Raises:
        ValueError: Bei ungültigem Typ oder abgelaufenem Token.
    """
    payload = decode_token(token)
    token_type = payload.get("type")
    if token_type != expected_type:
        raise ValueError(f"Ungültiger Token-Typ: erwartet {expected_type}, erhalten {token_type}")
    return payload

"""Auth-Router — Login, Register, Token-Refresh, Password-Reset, Push-Token."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import get_db
from app.models.user import User, PasswordResetToken
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    PushTokenRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.settings import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─── POST /auth/register ─────────────────────────────────────────
@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Neuen Benutzer registrieren",
)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Prüfe ob E-Mail bereits existiert
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Diese E-Mail-Adresse ist bereits registriert.",
        )

    # Benutzer anlegen
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.name,
    )
    db.add(user)
    await db.flush()

    # Tokens erstellen
    access_token, expires_in = create_access_token(str(user.id), user.role)
    refresh_token, _ = create_refresh_token(str(user.id))

    logger.info(f"Neuer Benutzer registriert: {user.email} ({user.id})")

    return {
        "token": access_token,
        "refreshToken": refresh_token,
        "expiresIn": expires_in,
        "user": user.to_dict(),
    }


# ─── POST /auth/login ────────────────────────────────────────────
@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Benutzer anmelden",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Benutzer finden
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-Mail oder Passwort ist falsch.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dieses Konto wurde deaktiviert.",
        )

    # Letzten Login aktualisieren
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()

    # Tokens erstellen
    access_token, expires_in = create_access_token(str(user.id), user.role)
    refresh_token, _ = create_refresh_token(str(user.id))

    logger.info(f"Benutzer angemeldet: {user.email}")

    return {
        "token": access_token,
        "refreshToken": refresh_token,
        "expiresIn": expires_in,
        "user": user.to_dict(),
    }


# ─── POST /auth/refresh ─────────────────────────────────────────
@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Access-Token erneuern",
)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = verify_token(body.refreshToken, expected_type="refresh")
    except (ValueError, Exception) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger oder abgelaufener Refresh-Token.",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger Token-Payload.",
        )

    # Prüfe ob User noch existiert
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Benutzer nicht gefunden oder deaktiviert.",
        )

    # Neue Tokens ausstellen
    new_access_token, expires_in = create_access_token(user_id, user.role)
    new_refresh_token, _ = create_refresh_token(user_id)

    logger.info(f"Token refreshed für: {user.email}")

    return {
        "token": new_access_token,
        "refreshToken": new_refresh_token,
        "expiresIn": expires_in,
    }


# ─── POST /auth/forgot-password ─────────────────────────────────
@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Passwort-Reset E-Mail senden",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Immer success zurückgeben, egal ob E-Mail existiert (Sicherheit)
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    user = result.scalar_one_or_none()

    if user:
        # Alte, unbenutzte Tokens für diesen User deaktivieren
        old_tokens = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
        )
        for token in old_tokens.scalars().all():
            token.used_at = datetime.now(timezone.utc)

        # Neuen Reset-Token erstellen
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=str(uuid.uuid4()) + str(uuid.uuid4()).replace("-", ""),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        )
        db.add(reset_token)

        logger.info(f"Passwort-Reset angefordert für: {user.email}")

    # TODO: E-Mail via Resend senden (Sprint 2)
    # await email_service.send_password_reset(body.email, reset_token.token)

    return {
        "message": "Wenn die E-Mail-Adresse existiert, wurde eine E-Mail zum Zurücksetzen gesendet.",
    }


# ─── POST /auth/reset-password ──────────────────────────────────
@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Passwort mit Token zurücksetzen",
)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == body.token,
            PasswordResetToken.used_at.is_(None),
        )
    )
    reset_token = result.scalar_one_or_none()

    if not reset_token or reset_token.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ungültiger oder abgelaufener Reset-Token.",
        )

    # User finden und Passwort aktualisieren
    result = await db.execute(
        select(User).where(User.id == reset_token.user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden.",
        )

    user.hashed_password = hash_password(body.password)
    reset_token.used_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info(f"Passwort zurückgesetzt für: {user.email}")

    return {"message": "Passwort erfolgreich zurückgesetzt."}


# ─── POST /auth/logout ──────────────────────────────────────────
@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Abmelden (Token ungültig machen)",
)
async def logout() -> dict:
    # Im einfachsten Fall client-seitiges Löschen der Tokens.
    # Für Blacklisting könnte man hier eine Redis-Allowlist/Blocklist pflegen.
    return {"message": "Erfolgreich abgemeldet."}


# ─── POST /auth/push-token ──────────────────────────────────────
@router.post(
    "/push-token",
    status_code=status.HTTP_200_OK,
    summary="FCM Push-Token registrieren",
)
async def register_push_token(
    body: PushTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"message": "Push-Token registriert."}

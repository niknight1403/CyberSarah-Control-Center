"""Pydantic-Schemata für Auth-Endpunkte."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., examples=["user@cybersarah.app"])
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., examples=["user@cybersarah.app"])
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=2, max_length=100, examples=["Max Mustermann"])

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped.replace(" ", "").replace("-", "").replace("'", "").isalpha():
            raise ValueError("Name enthält ungültige Zeichen")
        return stripped


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., examples=["user@cybersarah.app"])

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=32)
    password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(BaseModel):
    token: str
    refreshToken: str
    expiresIn: int


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    avatar: Optional[str] = None
    stripeCustomerId: Optional[str] = None
    isVerified: bool
    createdAt: str


class AuthResponse(BaseModel):
    token: str
    refreshToken: str
    expiresIn: int
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refreshToken: str = Field(..., min_length=32)


class PushTokenRequest(BaseModel):
    token: str = Field(..., min_length=1)
    platform: str = Field(..., pattern="^(ios|android)$")

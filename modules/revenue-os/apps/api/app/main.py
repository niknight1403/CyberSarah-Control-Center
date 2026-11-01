"""CyberSarah Revenue OS — FastAPI Application Entry Point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
import stripe

from app.database import init_db, close_db
from app.auth.routes import router as auth_router
from app.routes.agents import router as agents_router, register_default_agents
from app.settings import settings


# ─── Lifespan ───────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup/Shutdown-Events."""
    logger.info(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} startet...")
    logger.info(f"   Environment: {settings.ENVIRONMENT}")

    # Stripe-API-Key setzen
    if settings.STRIPE_SECRET_KEY:
        stripe.api_key = str(settings.STRIPE_SECRET_KEY)
        logger.info("   Stripe: API-Key konfiguriert")
    else:
        logger.warning("   Stripe: KEIN API-Key — Zahlungen deaktiviert")

    # Datenbank initialisieren
    try:
        await init_db()
        logger.info("   Datenbank: Initialisiert")
    except Exception as exc:
        logger.error(f"   DB INIT FAILED: {exc}")

    # KI-Agenten registrieren
    try:
        register_default_agents()
    except Exception as exc:
        logger.error(f"   AGENT INIT FAILED: {exc}")

    yield

    # Shutdown
    await close_db()
    logger.info("👋 Server heruntergefahren")


# ─── App-Instanz ───────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Autonomes Revenue Operating System — API für React Native Frontend & KI-Agenten",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)


# ─── Middleware ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Globaler Exception-Handler ─────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unbehandelter Fehler: {exc} | Path: {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Ein interner Fehler ist aufgetreten.",
            "code": "INTERNAL_ERROR",
            "timestamp": int(__import__("time").time()),
        },
    )


# ─── Router einbinden ──────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(agents_router, prefix="/api")


# ─── Health-Check ──────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
async def health_check() -> dict:
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "openai_available": bool(settings.OPENAI_API_KEY),
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
        "timestamp": __import__("time").time(),
    }


# ─── Direktstart ───────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )

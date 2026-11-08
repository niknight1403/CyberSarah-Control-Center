#!/usr/bin/env python3
"""Betriebs-Check fuer das FastAPI-Backend und den Celery-Worker.

Vorher: eine Datei, die den lokalen ASGI-Health aufrief und bei Fehler
abstuerzte. Das sagt nichts ueber den Betrieb — der Service laeuft auf
Render als eigener Web-Service (`cybersarah-backend`), und die geplanten
Agenten-Ticks laufen in einem Celery-Worker, den bisher gar nichts
beobachtet hat.

Jetzt drei getrennte Pruefungen:
  --local   In-Process-Rauchtest ueber ASGITransport (Standard, wie bisher)
  --live    Echter HTTP-Aufruf gegen den laufenden Service (Cold-Start-tolerant)
  --worker  Celery-Worker: Broker erreichbar, Worker antwortet auf Ping
  --all     alle drei

Aufruf:
  python scripts/backend_health_check.py
  python scripts/backend_health_check.py --all
  python scripts/backend_health_check.py --all --json

Exit-Code 1, sobald eine Pruefung wirklich fehlschlaegt (`fail`). Skips
und Warnungen bleiben sichtbar, blockieren aber nicht (ausser --strict).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

Severity = Literal["pass", "warn", "skip", "fail"]

DEFAULT_LIVE_URL = "https://cybersarah-backend.onrender.com"


@dataclass(slots=True)
class Check:
    name: str
    severity: Severity
    detail: str


def _record(results: list[Check], name: str, severity: Severity, detail: str) -> None:
    results.append(Check(name=name, severity=severity, detail=detail))


# ---------------------------------------------------------------------------
# 1. Lokal: ASGI-In-Process-Check
# ---------------------------------------------------------------------------
async def check_local(results: list[Check]) -> None:
    try:
        from httpx import ASGITransport, AsyncClient

        from backend.app import create_app
        from backend.config import Settings
    except Exception as exc:  # pragma: no cover - Umgebungsabhaengig
        _record(
            results,
            "Python-Umgebung",
            "skip",
            f"FastAPI/httpx nicht installiert ({exc.__class__.__name__}) — lokaler Check uebersprungen",
        )
        return

    try:
        settings = Settings(
            database_url=os.getenv("CYBERSARAH_DATABASE_URL", "sqlite+aiosqlite:///./cybersarah-health.db"),
            superagent_mode=os.getenv("CYBERSARAH_SUPERAGENT_MODE", "manual"),
        )
        app = create_app(settings)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/api/health")
        payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        if response.status_code == 200 and payload.get("ok") is True:
            _record(results, "Lokaler ASGI-Health", "pass", "HTTP 200, ok=true")
        else:
            _record(
                results,
                "Lokaler ASGI-Health",
                "fail",
                f"HTTP {response.status_code}, ok={payload.get('ok')!r}",
            )
    except Exception as exc:
        _record(results, "Lokaler ASGI-Health", "fail", f"{exc.__class__.__name__}: {exc}")


# ---------------------------------------------------------------------------
# 2. Live: echter HTTP-Aufruf gegen den laufenden Service
# ---------------------------------------------------------------------------
async def check_live(results: list[Check], base_url: str, attempts: int = 3) -> None:
    try:
        import httpx
    except Exception as exc:  # pragma: no cover
        _record(results, "Live-Backend", "skip", f"httpx fehlt ({exc.__class__.__name__})")
        return

    base = base_url.rstrip("/")
    endpoints = (
        ("/api/health", "Live-Backend /api/health"),
        ("/api/agent/status", "Live-Backend /api/agent/status"),
    )
    # Render antwortet fuer einen nicht existierenden Service mit
    # 404 + "x-render-routing: no-server". Das ist ein harter Befund
    # (Dienst nie deployt), kein Pfad-Tippfehler — deshalb eigener Zweig.
    host_missing = False

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0), follow_redirects=True) as client:
        for path, label in endpoints:
            if host_missing:
                _record(results, label, "skip", "Hostname existiert nicht — nicht pruefbar")
                continue

            last: tuple[int, str] | None = None
            succeeded = False
            for attempt in range(1, attempts + 1):
                try:
                    response = await client.get(f"{base}{path}")
                except Exception as exc:
                    last = (0, exc.__class__.__name__)
                    if attempt < attempts:
                        await asyncio.sleep(3 * attempt)
                    continue

                status = response.status_code
                routing = (response.headers.get("x-render-routing") or "").lower()

                if status == 200:
                    _record(results, label, "pass", "HTTP 200 (Service erreichbar)")
                    succeeded = True
                    break
                if status in (401, 403):
                    _record(results, label, "pass", f"HTTP {status} (Endpunkt erreichbar, auth-geschuetzt)")
                    succeeded = True
                    break
                if status == 404 and routing == "no-server":
                    _record(
                        results,
                        label,
                        "fail",
                        f"{base} existiert nicht (Render: x-render-routing=no-server) — Service nicht deployt",
                    )
                    host_missing = True
                    succeeded = True
                    break
                if status == 404:
                    _record(results, label, "warn", "HTTP 404 — Pfad unbekannt oder anderer Service hinter der URL")
                    succeeded = True
                    break
                if status < 500:
                    _record(results, label, "warn", f"HTTP {status} — unerwartete Antwort")
                    succeeded = True
                    break

                last = (status, "Serverfehler")
                if attempt < attempts:
                    await asyncio.sleep(3 * attempt)

            if not succeeded:
                status, reason = last or (0, "unbekannt")
                _record(
                    results,
                    label,
                    "fail",
                    f"keine brauchbare Antwort nach {attempts} Versuchen (HTTP {status}, {reason})",
                )


# ---------------------------------------------------------------------------
# 3. Worker: Broker + Celery-Ping
# ---------------------------------------------------------------------------
def check_worker(results: list[Check], timeout: float = 8.0) -> None:
    broker_url = (
        os.getenv("CELERY_BROKER_URL")
        or os.getenv("REDIS_URL")
        or "redis://localhost:6379/0"
    )
    parsed = urlparse(broker_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (6379 if parsed.scheme.startswith("redis") else 5672)

    try:
        with socket.create_connection((host, port), timeout=timeout):
            _record(results, "Celery-Broker", "pass", f"{host}:{port} erreichbar ({parsed.scheme})")
        broker_ok = True
    except OSError as exc:
        _record(results, "Celery-Broker", "warn", f"{host}:{port} nicht erreichbar ({exc.__class__.__name__})")
        broker_ok = False

    if not broker_ok:
        _record(results, "Celery-Worker-Ping", "skip", "ohne Broker nicht pruefbar")
        return

    try:
        from celery import Celery
    except Exception:
        _record(results, "Celery-Worker-Ping", "skip", "celery nicht installiert — Ping uebersprungen")
        return

    try:
        app = Celery("healthcheck", broker=broker_url)
        replies = app.control.ping(timeout=timeout)
        if replies:
            names = sorted(name for reply in replies for name in reply.keys())
            _record(results, "Celery-Worker-Ping", "pass", f"{len(replies)} Worker antworten: {', '.join(names)}")
        else:
            _record(results, "Celery-Worker-Ping", "warn", "kein Worker hat auf den Ping geantwortet")
    except Exception as exc:
        _record(results, "Celery-Worker-Ping", "warn", f"{exc.__class__.__name__}: {exc}")


# ---------------------------------------------------------------------------
# Auswertung
# ---------------------------------------------------------------------------
def summarize(results: list[Check], strict: bool) -> int:
    failed = [item for item in results if item.severity == "fail"]
    warned = [item for item in results if item.severity == "warn"]
    skipped = [item for item in results if item.severity == "skip"]
    passed = [item for item in results if item.severity == "pass"]

    print("")
    print("--- Zusammenfassung ---")
    for item in results:
        print(f"{item.severity.upper():5} {item.name}: {item.detail}")
    print("")
    print(
        f"{len(passed)}/{len(results)} bestanden, {len(warned)} Warnung(en), "
        f"{len(skipped)} uebersprungen, {len(failed)} Fehler"
    )
    if failed or (strict and warned):
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Health-Check fuer FastAPI-Backend und Celery-Worker.")
    parser.add_argument("--local", action="store_true", help="lokaler ASGI-Check (Standard)")
    parser.add_argument("--live", nargs="?", const="", metavar="URL", help="Live-HTTP-Check (optional mit URL)")
    parser.add_argument("--worker", action="store_true", help="Celery-Broker und Worker pruefen")
    parser.add_argument("--all", action="store_true", help="alle drei Pruefungen")
    parser.add_argument("--json", action="store_true", help="Ergebnis als JSON ausgeben")
    parser.add_argument("--strict", action="store_true", help="Warnungen als Fehler behandeln")
    parser.add_argument("--timeout", type=float, default=8.0, help="Timeout in Sekunden (Standard 8)")
    args = parser.parse_args()

    run_local = args.all or args.local or not (args.live is not None or args.worker)
    run_live = args.all or args.live is not None
    run_worker = args.all or args.worker

    results: list[Check] = []
    started = time.monotonic()

    if not args.json:
        print("=== CyberSarah Backend-Health ===")

    if run_local:
        asyncio.run(check_local(results))
    if run_live:
        live_url = (args.live or "").strip() or os.getenv("PYTHON_BACKEND_URL", "").strip() or DEFAULT_LIVE_URL
        if not live_url.startswith(("http://", "https://")):
            _record(results, "Live-Backend", "fail", f"ungueltige URL {live_url!r}")
        else:
            asyncio.run(check_live(results, live_url))
    if run_worker:
        check_worker(results, timeout=args.timeout)

    duration = round(time.monotonic() - started, 2)
    exit_code = summarize(results, args.strict)

    if args.json:
        print(
            json.dumps(
                {
                    "checks": [asdict(item) for item in results],
                    "failed": sum(1 for item in results if item.severity == "fail"),
                    "warned": sum(1 for item in results if item.severity == "warn"),
                    "duration_seconds": duration,
                    "exit_code": exit_code,
                },
                ensure_ascii=False,
                indent=2,
            )
        )

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from threading import Thread

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.config import Settings


def _resolve_settings(args: argparse.Namespace) -> Settings:
    defaults = Settings()
    return Settings(
        host=args.host or defaults.host,
        port=args.port if args.port is not None else defaults.port,
        database_url=args.database_url or defaults.database_url,
        superagent_mode=args.mode or defaults.superagent_mode,
    )


async def _wait_for_health(host: str, port: int, timeout_seconds: int = 30) -> dict:
    url = f"http://{host}:{port}/api/health"
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    last_error: Exception | None = None
    while True:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                last_error = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # pragma: no cover - startup timing only
            last_error = exc
        if asyncio.get_running_loop().time() >= deadline:
            raise RuntimeError(f"Health check failed for {url}: {last_error}") from last_error
        await asyncio.sleep(0.5)


def _launch_server(settings: Settings, *, health_check: bool, health_timeout_seconds: int) -> None:
    import uvicorn

    server = uvicorn.Server(
        uvicorn.Config(
            create_app(settings),
            host=settings.host,
            port=settings.port,
            log_level="info",
            workers=1,
        )
    )

    def runner() -> None:
        server.run()

    if health_check:
        thread = Thread(target=runner, daemon=True)
        thread.start()
        try:
            print(f"Launching CyberSarah backend on {settings.host}:{settings.port}")
            payload = asyncio.run(_wait_for_health(settings.host, settings.port, timeout_seconds=health_timeout_seconds))
            print({
                "host": settings.host,
                "port": settings.port,
                "database_url": settings.database_url,
                "superagent_mode": settings.superagent_mode,
                "health": payload,
            })
            print("backend health gate passed")
        finally:
            server.should_exit = True
            thread.join(timeout=10)
        return

    print({
        "host": settings.host,
        "port": settings.port,
        "database_url": settings.database_url,
        "superagent_mode": settings.superagent_mode,
    })
    print(f"Launching CyberSarah backend on {settings.host}:{settings.port}")
    server.run()


def main() -> None:
    parser = argparse.ArgumentParser(description="Single-command backend launch helper with env validation.")
    parser.add_argument("--host", default=None, help="Bind host. Defaults to CYBERSARAH_HOST or 0.0.0.0.")
    parser.add_argument("--port", type=int, default=None, help="Port. Defaults to CYBERSARAH_PORT or 8000.")
    parser.add_argument("--database-url", default=None, help="Database URL. Defaults to CYBERSARAH_DATABASE_URL.")
    parser.add_argument("--mode", choices=["manual", "autonomous"], default=None, help="Backend mode.")
    parser.add_argument("--dry-run", action="store_true", help="Print the resolved settings and exit without starting uvicorn.")
    parser.add_argument("--health-check", action="store_true", help="Run a startup health check and exit after confirming /api/health responds.")
    parser.add_argument("--health-timeout-seconds", type=int, default=30, help="Timeout for the startup health gate.")
    args = parser.parse_args()

    settings = _resolve_settings(args)
    print({
        "host": settings.host,
        "port": settings.port,
        "database_url": settings.database_url,
        "superagent_mode": settings.superagent_mode,
    })
    if args.dry_run:
        print("backend launch config validated")
        return

    _launch_server(settings, health_check=args.health_check, health_timeout_seconds=args.health_timeout_seconds)


if __name__ == "__main__":
    main()

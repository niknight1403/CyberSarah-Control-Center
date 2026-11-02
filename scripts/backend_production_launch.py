#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Production-style launch helper for the CyberSarah backend.")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument(
        "--database-url",
        default=None,
    )
    parser.add_argument(
        "--mode",
        choices=["manual", "autonomous"],
        default=None,
    )
    args = parser.parse_args()

    defaults = Settings()
    settings = Settings(
        host=args.host or defaults.host,
        port=args.port if args.port is not None else defaults.port,
        database_url=args.database_url or defaults.database_url,
        superagent_mode=args.mode or defaults.superagent_mode,
    )
    app = create_app(settings)
    import uvicorn

    print(f"Starting CyberSarah backend on {settings.host}:{settings.port} using {settings.database_url}")
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse

import uvicorn

from .app import create_app
from .config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the CyberSarah backend locally.")
    parser.add_argument("--host", default=None, help="Bind host for uvicorn.")
    parser.add_argument("--port", type=int, default=None, help="Port for uvicorn.")
    parser.add_argument(
        "--database-url",
        default=None,
        help="SQLAlchemy async database URL. Defaults to the value in backend.Settings.",
    )
    parser.add_argument(
        "--mode",
        choices=["manual", "autonomous"],
        default=None,
        help="Superagent mode for the health endpoint.",
    )
    args = parser.parse_args()

    defaults = Settings()
    settings = Settings(
        host=args.host or defaults.host,
        port=args.port if args.port is not None else defaults.port,
        database_url=args.database_url or defaults.database_url,
        superagent_mode=args.mode or defaults.superagent_mode,
    )
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()

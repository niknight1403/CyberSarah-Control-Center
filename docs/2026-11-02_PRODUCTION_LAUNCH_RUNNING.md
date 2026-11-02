# CyberSarah Production Launch

## Overview

This document captures the current production-style launch configuration for the local FastAPI backend harness.

## Local command

```bash
python scripts/backend_production_launch.py --host 0.0.0.0 --port 8000 --mode manual --database-url sqlite+aiosqlite:///./cybersarah.db
```

## Single-command local launcher

```bash
python scripts/backend_launch.py --dry-run
python scripts/backend_launch.py --host 0.0.0.0 --port 8000 --mode manual --database-url sqlite+aiosqlite:///./cybersarah.db
python scripts/backend_launch.py --health-check --host 127.0.0.1 --port 8010 --mode manual --database-url sqlite+aiosqlite:///./cybersarah-health-gate.db
```

This mode starts the app in a background thread, waits for `/api/health`, prints the resolved launch config, and exits once the health gate is green.

## Package-level shortcuts

```bash
npm run backend:launch -- --dry-run
npm run backend:launch -- --health-check --host 127.0.0.1 --port 8010
npm run backend:prod
npm run backend:health
npm run backend:smoke
npm run backend:env
```

## Environment variables

```bash
CYBERSARAH_HOST=0.0.0.0
CYBERSARAH_PORT=8000
CYBERSARAH_DATABASE_URL=sqlite+aiosqlite:///./cybersarah.db
CYBERSARAH_SUPERAGENT_MODE=manual
```

## Package entrypoint

```bash
python -m backend --host 0.0.0.0 --port 8000 --mode autonomous
```

## Health check

```bash
python scripts/backend_health_check.py
```

## Verification

```bash
python -m pytest tests/backend -q
```

Expected result:
- 24 passed

## Notes

- Safe defaults are enforced: invalid hosts are reset to `0.0.0.0`, invalid ports fall back to `8000`, invalid modes fall back to `manual`.
- The database directory is created automatically for SQLite paths when needed.
- The backend binds to the interface from `CYBERSARAH_HOST` or the CLI argument.
- `superagent_mode` is validated to allow only `manual` or `autonomous`.
- The current setup is production-style but still intentionally local and lightweight for development and verification.

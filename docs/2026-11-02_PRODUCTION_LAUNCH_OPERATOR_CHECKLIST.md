# Production Launch Operator Checklist

## Status

The local backend launch path is stable and validated for plausible production-style local startup.

## Safe defaults

- Host: `0.0.0.0`
- Port: `8000`
- Database: `sqlite+aiosqlite:///./cybersarah.db`
- Mode: `manual`

These values are enforced when the environment or CLI args are missing or invalid.

## Start commands

### Dry validation

```bash
python scripts/backend_launch.py --dry-run
```

### Standard local launch

```bash
python scripts/backend_production_launch.py --host 0.0.0.0 --port 8000 --mode manual --database-url sqlite+aiosqlite:///./cybersarah.db
```

### Health-gated startup

```bash
python scripts/backend_launch.py --health-check --host 127.0.0.1 --port 8010 --mode manual --database-url sqlite+aiosqlite:///./cybersarah-health-gate.db
```

## Quick validation

```bash
python scripts/backend_env_check.py
python scripts/backend_health_check.py
python -m pytest tests/backend -q
```

## Operational notes

- Invalid hosts fall back to `0.0.0.0`.
- Invalid ports fall back to `8000`.
- Invalid modes fall back to `manual`.
- SQLite parent directories are created automatically when needed.
- The launch path is local-first and intentionally lightweight, not a full remote deployment system.
- A non-blocking Starlette/httpx deprecation warning may still appear in test output, but it does not affect runtime behavior.

## Last known verification

- `python scripts/backend_launch.py --health-check ...` : passed
- `python -m pytest tests/backend -q` : 24 passed

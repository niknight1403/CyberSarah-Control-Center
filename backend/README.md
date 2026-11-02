# CyberSarah Backend

This package contains the local FastAPI backend used by the task ledger and agent-state harness.

## Run locally

```bash
python -m backend --host 127.0.0.1 --port 8000
```

Optional flags:

```bash
python -m backend --host 0.0.0.0 --port 9000 --mode autonomous --database-url sqlite+aiosqlite:///./cybersarah.db
```

## Main endpoints

- `GET /api/health`
- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/{task_id}`
- `PATCH /api/tasks/{task_id}`
- `POST /api/tasks/{task_id}/transition`
- `DELETE /api/tasks/{task_id}`
- `POST /api/logs`
- `GET /api/logs`
- `PUT /api/agent/state`
- `POST /api/agent/start`
- `POST /api/agent/stop`
- `GET /api/agent/status`
- `POST /api/chat/stream`
- `WS /ws/tasks`
- `WS /ws/chat`

## Validation

```bash
python -m pytest tests/backend -q
```

```bash
python scripts/backend_smoke.py
```

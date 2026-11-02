# CyberSarah Backend API Contract

Dieses Dokument beschreibt den lokal validierten Backend-Contract der Python-API unter `backend/`.

## 1. App-Setup

- `backend.create_app(settings=None) -> FastAPI`
- `backend.config.Settings`
  - `database_url: str = "sqlite+aiosqlite:///./cybersarah.db"`
  - `superagent_mode: Literal["manual", "autonomous"] = "manual"`
- Alle Endpunkte verwenden die in der App-Startup-Phase initialisierte SQLAlchemy-Engine und SessionFactory.

## 2. Health

### `GET /api/health`

Return:

```json
{
  "ok": true,
  "database": true,
  "mode": "manual"
}
```

- `ok` ist immer `true` nach erfolgreichem Start.
- `database` ist ebenfalls `true`, wenn die App und die DB-Initialisierung funktional sind.
- `mode` folgt `settings.superagent_mode`.

## 3. Aufgaben-API

### `POST /api/tasks`

Erstellt eine neue Aufgabe.

Erwartete Felder:
- `title` (required, nicht leer)
- `description` (optional)
- `priority` (optional, Standard: `0`)
- `payload` (optional)

Return: vollständige Task-Representation mit Status `pending`.

### `GET /api/tasks`

Optionaler Query-Parameter:
- `status`: z. B. `pending`, `running`, `succeeded`, `failed`, `cancelled`

Return: Liste aller Tasks, standardmäßig absteigend nach `id`.

### `GET /api/tasks/{task_id}`

Return: Task-Objekt oder `404` bei nicht vorhandenem Task.

### `PATCH /api/tasks/{task_id}`

Erlaubt das Aktualisieren von:
- `title`
- `description`
- `priority`
- `status`

### `POST /api/tasks/{task_id}/transition`

Finite-State-Machine-Logik:

- `pending -> running`
- `running -> succeeded`
- `running -> failed`
- `running -> cancelled`
- Andere Übergänge sind `409`.

### `DELETE /api/tasks/{task_id}`

Löscht den Task und antwortet mit `204 No Content`.

## 4. Logs

### `POST /api/logs`

Erwartete Felder:
- `task_id` (optional)
- `level` (optional, Standard: `info`)
- `message` (required)
- `data` (optional)

Return: Log-Objekt mit `id`, `task_id`, `level`, `message`.

### `GET /api/logs`

Optional:
- `task_id`
- `limit` (Standard: `100`)

Return: Liste der Logs in alter Reihenfolge; Sortierung wird für die API-Clients nach Bedarf umgekehrt.

## 5. Agent-Status

### `PUT /api/agent/state`

Setzt den aktuellen Agent-Mode wie `manual` oder `autonomous`.

Return:

```json
{"mode": "autonomous"}
```

### `POST /api/agent/start`

Setzt `stopped = false`.

### `POST /api/agent/stop`

Setzt `stopped = true` und antwortet mit HTTP `202 Accepted`.

### `GET /api/agent/status`

Return:

```json
{
  "mode": "autonomous",
  "stopped": false,
  "ws_clients": 0,
  "status": {
    "agent_id": "cybersarah-primary",
    "cached": true,
    "cache_keys": ["agent:status"]
  }
}
```

## 6. Chat-Streaming

### `POST /api/chat/stream`

Input:

```json
{
  "messages": [{"role": "user", "content": "Statusbericht"}],
  "max_history": 10
}
```

Verhalten:
- Client-`system`-Nachrichten werden verworfen.
- Ein System-Prompt wird intern eingefügt.
- Historie wird auf `MAX_PROMPT_CHARS` und `max_history` begrenzt.
- Output ist ein SSE-Stream mit `data: {...}`-Frames.
- Der letzte Frame ist `{ "done": true }`.

## 7. WebSockets

### `/ws/tasks`

- verwaltet Broadcast-Events wie `task.created` und `log.appended`
- beantwortet `ping` mit `pong`

### `/ws/chat`

- akzeptiert JSON-Nachrichten mit `messages` und optional `max_history`
- sendet `chat.delta` und abschließend `chat.done`

## 8. Cache-First-Status

Der Cache ist als einfache per-DB-Schicht eingebaut:

- `StateCache.set(key, value, ttl_seconds=None)`
- `StateCache.get(key)`
- `StateCache.invalidate(key)`
- `cached_agent_status(cache, agent_id)` liefert die erwartete Rückgabeform.

## 9. Verifikation

Validiert mit:

```bash
python -m pytest -q
```

Zusätzlich verfügbar:

```bash
python scripts/backend_smoke.py
```

Damit wird die lokale API-Initialisierung und die Kernendpunkte in einer ASGI-Umgebung überprüft.

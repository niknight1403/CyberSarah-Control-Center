# Sprint 54 — Release-Bericht: Koyeb-Exit (Render+Neon) & persistierte Chat-Historie

**Datum:** 2026-09-10 · **Status:** ALL GREEN (328/328 Tests, tsc sauber, Bundle & Workspace-Service valide, E2E gegen Sandbox-PG bestanden)

## Zusammenfassung

Zwei Tranchen in einem Sprint:

1. **Koyeb durch Render + Neon ersetzt** — vollständige, hundertprozentig kostenfreie Produktionsumgebung ohne den blockierten Koyeb-API-Token (Issue #3 ist damit obsolet).
2. **Entwicklungsauftrags-Chat-Historie serverseitig auf PostgreSQL persistiert** — der Chat überlebt Geräte- und App-Wechsel; die mobile App hydriert beim Öffnen aus der Server-Historie.

## Teil 1: Render + Neon (Koyeb-Entfernung)

**Entfernt:** `scripts/koyeb-deploy.mjs`, `lib/koyeb-deploy-logic.mjs`, `tests/koyeb-deploy-logic.test.ts`, `.github/workflows/koyeb-bootstrap.yml`, `docs/koyeb-deployment.md`, `Dockerfile.koyeb`, `workspace-service/Dockerfile.koyeb`, `drizzle.config.koyeb.ts`. Repository-relevante Koyeb-Erwähnungen existieren nur noch als historische Verweise in Sprint-Berichten.

**Neu aufgebaut:**

- **`render.yaml`** — Blueprint mit zwei Free-Diensten: `cybersarah-control-center` (Docker: API + statischer Web-Export) und `cybersarah-workspace` (`rootDir: workspace-service`, Docker, Port 8787).
- **`.github/workflows/render-deploy.yml`** — `workflow_dispatch` mit `target: app|workspace`: npm ci → TypeCheck + Tests → `scripts/render-deploy.mjs --migrate` bzw. `--workspace`.
- **`scripts/render-deploy.mjs`** — idempotenter Deploy: API-Key- und DATABASE_URL-Validierung (nur `postgresql://`, kein localhost) → Drizzle-Migrationen → Service-Neuanlage oder ENV-Komplett-Ersatz → Warten auf Live-Deploy → öffentliche Verifizierung von `/api/health` bzw. `/api/v1/health`. `--dry-run` zeigt nur den maskierten Request-Body, **ohne jeden API-Kontakt**.
- **`lib/render-deploy-logic.mjs`** — Token-Bereinigung (`rnd_`-Format), ENV-Builder mit Pflicht-/Optional-Semantik und Newline-Schutz, Render-Request-Builder, `renderApiError` (401 → Key ungueltig, 429 → Rate-Limit, Build-Fail → Render-Logs pruefen), `maskSecrets`.
- **`docs/render-deployment.md`** — Free-Plan-Begründung (750 Instanz-Stunden geteilt, Schlaf nach 15 Min.), **Neon statt Render-Postgres** (Free-Postgres wird nach 30 Tagen gelöscht), ENV-Pflichtliste, Initiale Inbetriebnahme, Ephemeral-Storage-Hinweis.

**Security-Fund beim Dry-Run behoben:** Die erste Maskierungs-Version erfasste nur `KEY=VALUE`-Zeilen — im JSON-Dry-Run erschienen `sk_live_…` und `whsec_…` im Klartext. `maskSecrets` maskiert jetzt zusätzlich JSON-`value`-Felder nach `key`-Namen (via `SENSITIVE_ENV_KEYS`-Liste) sowie die Token-Formate `sk_live_`, `sk_test_`, `whsec_`, `rnd_`, `ghp_`. Test verankert beides.

**Workspace-Service:** `WORKSPACES_DIR`-Auflösung mit Ephemeral-Fallback — ist der konfigurierte Pfad nicht beschreibbar, fällt der Dienst auf ein lokales Verzeichnis zurück und warnt beim Start (Render Free hat keine persistenten Disks; Persistent Disk = dokumentierter Upgrade-Pfad).

**Autonom erledigt:** `SERVICE_ACCESS_TOKEN` (frisch generiert, `sat_…`) als GitHub-Actions-Secret hinterlegt (API-Setzung, libsodium-verschlüsselt). 53 Actions-Secrets sind jetzt gesetzt.

**Offene Owner-Schritte (bewusst beim Owner):**

1. `RENDER_API_KEY` als Actions-Secret (Render-Dashboard → Account Settings → API Keys, `rnd_…`).
2. `DATABASE_URL` ersetzen durch Neon-Connection-String (Neon-Free-Project anlegen).
3. Einmaliger Workflow-Start „Render Deploy" (`target: app`, optional danach `target: workspace`).
4. Custom Domain `app.cybersarah-ki.com` im Render-Dashboard (DNS-Cutover, Phase 5 Hetzner-Exit).

## Teil 2: Persistierte Chat-Historie (PostgreSQL)

- **Schema:** Tabelle `chatMessages` (id, userOpenId, role, content, provider, createdAt); Migration `drizzle/0001_tidy_johnny_blaze.sql` generiert und gegen die Sandbox-PG eingespielt.
- **`server/db.ts`:** `insertChatMessage`, `insertChatTurn` (User+Assistant atomar), `listChatMessages` (DESC, Limit 1–500, openId-Filter).
- **Router:** `developmentChat.send` persistiert jeden Turn (Best-Effort — Persistenzfehler brechen die Chat-Antwort nicht); `developmentChat.history` liefert die serverseitige Historie.
- **`lib/chat-history-logic.ts`:** Rollen-Normalisierung (`user|assistant|system`), 64k-Inhaltskappung, Turn-Validierung, Prompt-Abbildung (älteste zuerst, Limit = neueste N) und UI-Abbildung (`assistant` → `agent`, stabile `server-…`-Ids) — 11 deterministische Tests.
- **Chat-Screen:** Hydriert beim Öffnen aus der Server-Historie, wenn lokal noch keine Konversation existiert; lokale (per SecureStore geschützte) Historie bleibt vorrangig.

**E2E (Sandbox-PG, Port 55432):** `insertChatTurn` → 2 Zeilen; `listChatMessages` → Rollen korrekt; UI- und Prompt-Abbildung verifiziert.

## Regression

- 328/328 Tests grün (54 Dateien), inkl. 19 Render-Deploy-Logic- und 11 Chat-History-Logic-Tests
- `tsc --noEmit` sauber; Produktions-Bundle (`esbuild`) baubar und syntaxgeprüft
- `workspace-service/src/index.js` syntaxgeprüft (Ephemeral-Fallback eingebaut)
- `render-deploy.yml`/`render.yaml` YAML-valide; Dry-Run beider Deploy-Ziele mit maskierten Secrets verifiziert
- `docs/deployment-config.test.ts` verankert Render+Neon als Zielplattform und Koyeb-Freiheit des Codes

## Nächste Schritte

- Owner: `RENDER_API_KEY` + Neon-`DATABASE_URL` hinterlegen, dann „Render Deploy" starten
- Nach DNS-Cutover: Phase 6 (VPS-Dekommission) aus `docs/HETZNER-EXIT.md`
- Backlog: Strukturierte Healthchecks der PaaS-Betriebspfade in einer zentralen Betriebsansicht konsolidieren

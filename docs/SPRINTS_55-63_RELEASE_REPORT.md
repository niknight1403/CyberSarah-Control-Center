# Release-Bericht: Sprints 55–63 (2026-09-10)

**Commits:** 430a30f → 40271bb (9 Sprints, 69 neue deterministische Tests)
**Regression:** 391/391 Tests grün · `tsc --noEmit` grün · Workspace-Service-Syntax grün
**Infrastruktur-Ziel:** Render Free + Neon Free PostgreSQL (siehe docs/render-deployment.md, docs/HETZNER-EXIT.md)

## Uebersicht

Nach dem Render/Neon-Umstieg (Sprint 54) haelt dieser Block das Versprechen
„Produktionsreife vor dem ersten Deploy": Betriebsfuehrung, Chat-Datenhaltung
und Robustheit sind so weit gebracht, dass der Deploy-Weg (GitHub-Actions-
Workflow „Render Deploy", target app|workspace) ohne Nacharbeiten bestanden
werden kann.

## Sprint-Einzelberichte

### Sprint 55 — MySQL→PostgreSQL-Migrationsplan (430a30f)
- `lib/mysql-pg-migration-plan.ts` + 8 Tests: Typabbildung, Spalten- und
  Constraint-Mapping, Sequenz-Ruecksetzung nach Import, Cutover-Fahrplan mit
  Checkpoint „Rollback solange moeglich".
- Grundlage fuer Hetzner-Exit Phase 3 (mysqldump → Koyeb-PG-Import → Neon).

### Sprint 56 — Zentrale Betriebsuebersicht (b02948b)
- `lib/ops-overview-logic.ts` + 12 Tests: priorisierte Empfehlungen
  (Datenbank > LLM > Workspace), Health-Aggregation, 100-ms-Toleranzband
  gegen Flackern.
- `ops.overview` (admin) mit echten Probes: DB, Workspace, Chat-Env, Metriks.

### Sprint 57 — Chat-Sessions (d1e2e23)
- Migration 0002: `sessionId` (varchar 64, Default 'default') + Index auf
  chatMessages; gegen Sandbox-PG angewendet und E2E verifiziert.
- `lib/chat-session-logic.ts` + 6 Tests; `developmentChat.sessions`, `history`
  und `send` mit optionalem sessionId-Feld.

### Sprint 58 — Chat-Export (5ab60da)
- `lib/chat-export-logic.ts` + 7 Tests: Markdown (Rollenlabels, Zeitstempel,
  Injection-neutralisierte Titel) und JSON (parse-stabil, Version 1).
- `developmentChat.export` (protected, eigene Daten, Format- und
  Sitzungswahl).

### Sprint 59 — Chat-Fair-Use (83f44ca)
- `lib/chat-quota-logic.ts` + 7 Tests: Tagesquote aus der persistenten
  Historie (UTC-Tageszaehlung), Ruecksetzpunkt naechste UTC-Mitternacht,
  Admin-Bypass.
- Quoten-Gate in `send` vor dem LLM-Aufruf (TOO_MANY_REQUESTS),
  `DAILY_CHAT_LIMIT` per ENV (Default 50).

### Sprint 60 — DB-Backup-Manifest (6a54294)
- `lib/db-backup-manifest-logic.ts` + 6 Tests: exakte Tabellen-Zeilenzahlen,
  FNV-1a-Pruefsumme (Tamper-Erkennung), Frische-Fenster (Default 25 h).
- `db.tableRowCounts()` mit Identifier-Whitelist; `ops.backupManifest` (admin).
- Sandbox-PG dabei komplett neu aufgesetzt (users-Tabelle fehlte nach
  Reinitialisierung), Migrationen 0000–0002 frisch, Admin-Seed wiederher.

### Sprint 61 — Feature-Flags (b679c21)
- `lib/feature-flag-logic.ts` + 6 Tests: Registry (Sprint-56–60-Features),
  ENV-Override-Parser `FEATURE_FLAGS="flag=on,flag=off"`, Client-Sicht ohne
  Interna.
- `features.list` (protected); chatQuota-/chatExport-Gates — Persistenz und
  Chat-Antwort bleiben unberuehrt.

### Sprint 62 — Workspace-Kaltstart-Resilienz (2db6519)
- `lib/workspace-coldstart-logic.ts` + 6 Tests: Fehlerklassifikation
  (Kaltstart-verdaechtig: ECONNREFUSED/ETIMEDOUT/…, HTTP 408/502/503/504;
  Auth; echt down), Retry-Plan 1500/4000 ms, Warmup-Plan.
- `probeWorkspace` (ops-router): bis zwei Kaltstart-Retries, erschoepfte
  Kaltstarts melden 'unknown' statt faelschlich 'down'.

### Sprint 63 — Chat-Suche (40271bb)
- `lib/chat-search-logic.ts` + 7 Tests: UND-Verknuepfung, Bewertung
  (Termanzahl > Vorkommnisse > Titeltreffer > Aktualitaet), Schnipsel.
- `developmentChat.search` (protected, eigene Daten, Sitzungseingrenzung);
  E2E gegen Sandbox-PG verifiziert.

## Offene Owner-Schritte (unveraendert)

1. **RENDER_API_KEY** (rnd_…) als GitHub-Actions-Secret anlegen.
2. **DATABASE_URL** im Actions-Secret auf den Neon-Connection-String setzen.
3. Workflow „Render Deploy" starten (target app, spaeter workspace).
4. Custom Domain `app.cybersarah-ki.com` im Render-Dashboard (Phase 5).

## Naechster sinnvoller Block

- Neon-Import-Fahrplan aus Sprint 55 mit dem Backup-Manifest (Sprint 60)
  verketten: Import-Verify vor Cutover.
- Workspace-Volume: WORKSPACES_DIR bleibt ohne Volume-Konfiguration ephemer —
  Render-Disk oder S3-kompatibler Storage entscheiden.

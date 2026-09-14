# Sprint 110 — Zentrale Betriebsansicht

**Status:** Abgeschlossen · **Datum:** 14.09.2026 · **Vorstand:** Sprint 109 (Coverage-PR-Kommentar-Robustheit), 661 Tests grün

## Ziel

Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidiert und Warnstufen in der zentralen Betriebsansicht zusammengeführt (Roadmap `docs/ROADMAP_AB_SPRINT_107.md`, Phase B).

## Umgesetzte Arbeiten

### 1. Neue PaaS-Checks in `ops.overview`

| Komponente | Prüfung | Quelle | Ohne Konfiguration |
|---|---|---|---|
| `renderDeploy` | Letzter Deploy-Status des Render-Web-Services | Render-API `/v1/services` + `/deploys?limit=1` (`RENDER_API_KEY`, optional `RENDER_SERVICE_ID`) | ehrliches `unknown` mit Hinweis |
| `neonPostgres` | SELECT-1-Roundtrip-Latenz gegen Neon | `checkDatabaseHealth()` mit Zeitmessung (>3 s → Warnung, Fehlschlag → kritisch) | Messung läuft immer mit |
| `workspaceMode` | Workspace-Service-Modus aus `/api/v1/health` | `mode: "postgres"` → ok; `mode: "ephemeral"` → Warnung (WIP-Dateien überleben Re-Deploys nicht) | ohne `WORKSPACE_SERVICE_URL` weiterhin `unknown` |
| `uptimeWatcher` | Offener `uptime-alert`-Alarm (GitHub-Issue) + Erholungsfenster 24 h | GitHub-Issues-API des öffentlichen Repos, unauthentifiziert (optional `OPS_UPTIME_REPO`) | Rate-Limit/Netzwerkfehler → ehrliches `unknown` |

### 2. Warnstufen je Komponente

`lib/ops-overview-logic.ts`: `OpsCheckView` trägt jetzt `level` (`ok`/`warnung`/`kritisch`/`unbekannt`), `checkedAt` (Messzeitpunkt) und `lastFailure` (letztes bekanntes Fehlerbild, über Messungen hinweg erhalten). Die Dashboard-Betriebswacht-Kachel (Sprint 96) zeigt alle Komponenten mit Stufe, relativer Zeitangabe und dem letzten Fehlerbild für erholte Komponenten.

### 3. Admin-Benachrichtigung bei Stufenwechsel zu kritisch

`server/ops-alerts.ts`: Stufenverlauf je Komponente im Prozessspeicher; `evaluateOpsTransitionsAndAlert()` prüft jeden `ops.overview`-Aufruf (Dashboard pollt minütlich) auf Übergänge zu `down` und sendet eine tokenfreie Alarmmeldung über `DISCORD_WEBHOOK_URL` (analog Uptime-Wächter, Sprint 92). Ohne Webhook bleibt der Alarm ehrlich „nur im Dashboard sichtbar". Erstlauf ohne Vorbildzustand alarmiert bewusst nicht (kein Boot-Rauschen); dauerhaft kritische Pfade deckt der externe Uptime-Wächter ab.

### 4. Datenschutz der Telemetrie

`ops.overview` bleibt `adminProcedure` — Standardnutzer erhalten keinerlei Telemetrie; alle Meldungen sind tokenfrei (Keys werden nie in Details, Meldungen oder Alarmen geführt).

## Akzeptanzkriterien (Roadmap) — erfüllt

- ✅ Dashboard-Betriebswacht zeigt alle Komponenten mit Stufen (ok/Warnung/kritisch) inkl. Zeitstempel und letztem Fehlerbild.
- ✅ Statuswechsel zu kritisch triggert eine Benachrichtigung (Discord-Webhook, key-gated).
- ✅ Nicht-Admins sehen keine Telemetrie (unverändert `adminProcedure`).
- ✅ TypeScript sauber (`tsc --noEmit`), volle Vitest-Suite grün: **671/671 Tests** (10 neue deterministische Tests in `tests/ops-paas-logic.test.ts`), Server-Build erfolgreich (`dist/index.js`).

## Neue Umgebungsvariablen (alle optional — ehrliche Nicht-Konfiguriert-Zustände)

| Variable | Zweck | Fehlt sie |
|---|---|---|
| `RENDER_API_KEY` | Live-Deploy-Status via Render-API | Deploy-Check meldet `unknown` mit Hinweis |
| `RENDER_SERVICE_ID` | Zielt Service gezielt an (Default: erster Web-Service) | erster Web-Service wird geprüft |
| `DISCORD_WEBHOOK_URL` | Admin-Alarm bei Stufenwechsel zu kritisch | Alarm nur im Dashboard sichtbar (Protokoll-Log) |
| `OPS_UPTIME_REPO` | Repo des Uptime-Wächters (Default `niknight1403/CyberSarah-Control-Center`) | Default-Repo wird geprüft |

## Dateien

- `lib/ops-overview-logic.ts` — neue Kinds, Warnstufen, Zeitstempel, Fehlerbild, Stufenwechsel-Logik (rückwärtskompatibel)
- `lib/ops-paas-logic.ts` — neue reine Klassifizierungen (Neon-Latenz, Render-Status, Uptime-Fenster, Discord-Payload)
- `server/ops-alerts.ts` — Stufenverlauf, Fehlerbilder, Discord-Alarm (key-gated)
- `server/ops-router.ts` — neue Probes, Workspace-Modus, Alarm-Anbindung
- `app/(tabs)/dashboard.tsx` — Betriebswacht-Kachel mit Stufen/Zeit/Fehlerbild
- `tests/ops-paas-logic.test.ts` — 10 neue deterministische Tests

## Bewusste Grenzen (dokumentiert)

- Stufenverlauf lebt im Prozessspeicher: nach Server-Restart gibt es keinen Erstalarm; die Erkennung greift ab dem zweiten Messzyklus (Dashboard-Poll minütlich).
- Der Uptime-Check liest öffentliche GitHub-Issues unauthentifiziert (Rate-Limit 60/h) — bewusst keylos; bei Erreichen des Limits ehrliches `unknown` statt Fehlalarm.
- `metrics` bleibt `unknown` (wie seit Sprint 56 — kein METRICS_TOKEN im Einsatz).

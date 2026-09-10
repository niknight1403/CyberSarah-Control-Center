# Sprint 71 — Autonomer Modell-Router & Superagent-Briefing

**Datum:** 2026-09-10 · **Commits:** siehe Git-Historie · **Status:** abgeschlossen, 451/451 Tests grün, tsc sauber, CI grün

## Ziel

Der Chat ("Superagent") waehlt ab sofort selbststaendig die optimale KI fuer jeden Entwicklungsauftrag, ueberwacht alle Endpoints und failover-t automatisch — Administratoren muessen keine Provider mehr manuell waehlen. Der Chat ist zudem mit Workspace, Agent, Vorschau und den Laufzeitdaten des Systems verknuepft.

## Umsetzung

### Reine Logik (lib/)

- **`lib/model-router-logic.ts`** — Router-Provider-Universum (11 Provider, ohne "auto"), Auftrags-Klassifikation (TaskType `code`/`reasoning`/`ui`/`chat`, Komplexitaet `light`/`medium`/`heavy`), Qualitaets-Scores, autonome Cooldowns bei Fehlern, Timeouts und Rate-Limits, failover-sichere Provider-Reihenfolge, persistente bevorzugte Reihenfolge. 16 deterministische Tests.
- **`lib/superagent-brief-logic.ts`** — Superagent-Briefing: Systemzustand, Laufzeitfehler, Workspace-/Repository-/Preview-Situation und aktive Modell-Route als deterministischer Kontext fuer komplexe Auftraege. 6 Tests.
- **`lib/use-admin-auto-router.ts`** — idempotenter Admin-Hook: aktiviert "auto" automatisch (Settings, Agent, Chat-Screen).

### Server

- **`server/model-router.ts`** — Health-Tracking, persistente Konfiguration in der neuen Tabelle `modelRouterSettings` (Migration `drizzle/0003_wonderful_black_bolt.sql`), Boot-Restore via `restoreRouterState()`, `getRouterSnapshot()`, `probeLocalProviders()` (aktiver Ollama/LM-Studio-Ping).
- **`server/development-chat.ts`** — `handleAutoRoutedChat` (nur Admin, Rolle aus `ctx.user.role`), Fallback-Kette auf Router-Entscheidung, Superagent-Briefing mit echten Systemdaten, `route`-Feld im Result (TaskType, Komplexitaet, versuchte Provider, Gruende). Admin-tRPC: `routerStatus`, `setPreferredOrder`, `probeLocalProviders`.

### UI

- Provider-Profil: "Autonomer Superagent / Auto-Router" an oberster Stelle, Status-Indikator "Autonomes Routing aktiv", manuelle Provider-Wahl fuer Admins gesperrt, Auto-Auswahl nach Admin-Login.

## Verifikation

- 451/451 Vitest-Tests gruen (20 neue), `tsc --noEmit` sauber, vollstaendige Regression nach Sprint-70-Stand.
- CI auf origin/main gruen (Build, Lint, Tests).

## Randnotiz (Branch-Konsolidierung, gleicher Tag)

Branch-Audit: `next-development`, `feat/device-adapter-allowlist`, `fix/monitoring-config-alignment` sind vollstaendig in main enthalten (0 eigene Commits); der Codespace-Branch enthaelt ausschliesslich einen regenerierten `package-lock.json` ohne Feature-Wert (nicht gemerged, um den gruenen Lockfile-Stand nicht zu destabilisieren). `fix/auth-logout-regression-279ca27` wurde auf Antrag geloescht.

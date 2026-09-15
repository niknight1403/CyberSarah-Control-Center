# Sprint 121 — Backup-Wächter (Backup-Erweiterung)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 801/801 Tests grün, Server-Build erfolgreich

## Ziel

Regelmäßige Backup-Prüfungen mit Ops-Alarm bei Überschreitung (Erweiterung der Selbstbedienung aus Sprint 120): Der Backup-Rhythmus wird überwacht, ein ablaufender oder überfälliger Backup-Zyklus alarmiert den Admin über den bestehenden Betriebswacht-Pfad.

## Umsetzung

### Reine Logik — `lib/backup-watch-logic.ts`

- **Schwellen:** Warnung ab 22 h, kritisch ab 26 h (Tagesrhythminus Toleranz) — Konstanten exportiert, Grenzfälle getestet.
- **Bewertung** (`evaluateBackupWatch`): kein Eintrag → ehrlich „unbekannt" statt Fehlalarm (kein falscher Erstalarm nach Server-Restart), unter 22 h → „ok" mit Stunden-Detail/Prüfsumme/Zeilen, 22–26 h → „degraded" mit Handlungsempfehlung, über 26 h → „down". Uhrdrift (Zukunft) bleibt still „ok".
- **Verzeichnung** (`recordBackupWatchRun`): Zeit, Prüfsumme, Zeilenzahl — Kopie statt Mutation.
- **Ops-Anbindung** (`buildBackupWatchCheckInput`): Check-Eingabe für die Betriebswacht, Messzeitpunkt jetzt.

### Server

- `server/backup-watch.ts`: Prozessspeicher-Snapshot (bewusst analog `ops-alerts.ts`, Restart-Verhalten dokumentiert), `recordBackupRun`/`getBackupWatchSnapshot`/Reset für Tests.
- `server/ops-router.ts`: `backupManifest` und `backupExport` verzeichnen erfolgreiche Läufe (nur gültige, ausgelieferte Exporte zählen); die Betriebswacht (`overview`) bewertet den Backup-Stand bei jeder Auswertung — die „regelmäßige Prüfung" ist damit an jedes Dashboard-Polling gebunden, ohne eigenen Cron-Dienst. Stufenwechsel zu kritisch alarmiert über den bestehenden Sprint-110-Discord-Pfad.
- `lib/ops-overview-logic.ts`: neuer CheckKind `backup` (Label „Backup-Wächter") mit tokenfreien, handlungsfähigen Meldungen je Zustand; die Ops-Watch-Kachel rendert den Check automatisch.

## Tests (12 neu)

- Schwellen-Konstanten (Warnung < Kritisch, Tagesrhythmus-Toleranz).
- Erstzustand ohne Fehlalarm, Verzeichnung (Kopie-Semantik, Überschreiben).
- Bewertung: ok/degraded/down, Grenzfälle exakt 22 h/26 h, Uhrdrift.
- Ops-Check-Eingabe (kind, Zustand, Detail, Messzeit) inkl. leerem Snapshot.
- Deutsche Stunden-Formatierung („1,5", „5,0").

## Ehrliche Grenzen (dokumentiert)

- Der Wächter-Stand lebt im Prozessspeicher: nach einem Server-Restart meldet der Wächter ehrlich „unbekannt", bis der nächste Backup-Lauf verzeichnet wird — kein Fehlalarm, aber auch keine Restart-übergreifende Historie (dauerhaft kritische Pfade deckt der externe Uptime-Wächter ab).
- Es gibt keinen servereigenen Cron: die regelmäßige Prüfung läuft bei jeder Betriebswacht-Auswertung (Admin-Dashboard, 60-s-Polling); wer unabhängig vom Dashboard prüfen will, hängt einen externen Heartbeat-Cron an `ops.overview`.

## Nächste Schritte (Sprint 122)

MCP-Transport: Erweiterung des MCP-Setups um einen additional Transport (HTTP/SSE) neben dem bestehenden Streamable-HTTP.

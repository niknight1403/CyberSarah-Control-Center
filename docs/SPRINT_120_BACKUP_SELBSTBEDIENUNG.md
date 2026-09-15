# Sprint 120 — Backup-Selbstbedienung

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 789/789 Tests grün, Server-Build erfolgreich

## Ziel

Admins ziehen vollständige Datenbank-Backups (Manifest + alle Tabellendaten) selbst — ohne Shell-Zugang, per Knopfdruck aus der App (Sprint-60-Manifest als Checksummen-Wahrheit weitergeführt).

## Umsetzung

### Reine Logik — `lib/backup-self-service-logic.ts`

- **Export-Umschlag:** `buildBackupExport` verpackt das bestehende Manifest (Sprint 60, `lib/db-backup-manifest-logic.ts`) mit den vollständigen Tabellendaten in einen versionierten Umschlag (`cybersarah-db-backup-export`, Version 1); Daten-Keys werden auf die sortierten Manifest-Tabellen normalisiert.
- **Strenge Validierung** (`validateBackupExport`): Format/Version, Manifest-Prüfsumme (FNV-1a nachgebaut), Konsistenz Manifest ↔ Daten (jede Tabelle vorhanden mit exakter Zeilenzahl, keine zusätzlichen Tabellen ohne Eintrag) und Zeilen-Grenze pro Tabelle (50 000, Missbrauchsschutz).
- **Anzeige:** `estimateExportSizeBytes`/`formatBackupSize` (B/KB/MB, deutsche Dezimaltrenner), `summarizeBackupExport` (Dateiname, Zeilen, Tabellen, Größe, Alter) für die Kachel.

### Server

- `server/db.ts`: `dumpProjectTables()` — vollständiger Zeilen-Dump nach dem gleichen sicheren Muster wie `tableRowCounts()` (Identifier nur aus `information_schema`, Regex-geprüft, LIMIT gekappt); Date → ISO, Buffer → Base64 transportierbar gemacht.
- `server/ops-router.ts`: `backupExport` als Admin-Mutation — dump, Umschlag bauen, vor Rückgabe validieren; ungültige Exporte werden nicht ausgeliefert.

### UI — `app/(tabs)/dashboard.tsx`

Backup-Kachel im Admin-Bereich: „Backup jetzt erstellen" triggert die Mutation, zeigt Laufzustand, Zusammenfassung (Zeilen · Tabellen · Größe, Dateiname + Alter) und Fehler ehrlich an; auf Web wird die JSON-Datei (Manifest-Dateiname) per Blob-Download ausgeliefert.

## Tests (12 neu)

- Umschlag: Manifest ↔ Daten-Konsistenz, Sortierung, leere Datenbank, Normalisierung.
- Validierung: Roundtrip, falsches Format/Version, manipulierte Prüfsumme, fehlende Tabelle (Zeilenzahl), zusätzliche Tabelle ohne Eintrag, Zeilen-Grenze.
- Anzeige: Größenstufen, deterministischer Schätzwert, Zusammenfassung inkl. Alters-Label („vor 5 Min." / „gerade erstellt").

## Ehrliche Grenzen (dokumentiert)

- Der Export ist ein JSON-Snapshot zum Abrufzeitpunkt — kein automatischer Zeitplan; die Manifest-Historie bewusst nicht persistiert (jeder Abruf erzeugt frisch geprüfte Daten).
- Auf Native gibt es die Zusammenfassung ohne Datei-Download (Web: Blob-Download); ein Share-Sheet folgt, wenn Native-Backup-Distribution gebraucht wird.
- Tabellen über 50 000 Zeilen würden die Validierung bewusst fehlschlagen statt still gekappt zu werden.

## Nächste Schritte (Sprint 121)

Backup-Erweiterung: Zeitplan-Trigger (cron-ähnliche Automation) für regelmäßige Manifest-Prüfungen mit Ops-Alarm bei Überschreitung.

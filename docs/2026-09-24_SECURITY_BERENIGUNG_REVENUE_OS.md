# Sicherheits-Bereinigung: cybersarah-revenue-os (24.09.2026)

## Befund (aus der Repo-Adoption-Analyse)

`cybersarah-revenue-os` enthielt Datenbank-Backups im Git — Verstoß gegen die
Projektregel "Keine SQL-Datenbanken oder Token im Git-Verlauf":

1. `CyberSarah-DB-Backup-20260729-173952.sql` (164 B — pg_dump-Fehlermeldung)
2. `CyberSarah-DB-Backup-20260729-174146.sql` (164 B — pg_dump-Fehlermeldung)
3. `CyberSarah-DB-Backup-20260729-174217.sql` (2 KB — leeres Scaffolding, 49 Tabellen à "0 rows")
4. `cybersarah-db-backup-20260729-174328.tar.gz` (8,6 KB — CSV-Export)

## Ehrliche Inhaltsprüfung (alle historischen Versionen)

- **Keine personenbezogenen Daten:** `coupon_uses.csv` und `leads.csv` enthalten
  nur Spaltenköpfe (`kunden_email`, `kunden_telefon`), null Zeilen. `email_sequenzen.csv`
  (22 KB) enthält Marketing-Textvorlagen, keine Kundendaten.
- **Keine Geheimnisse:** kein Token, kein API-Key, keine Zugangsdaten in irgendeiner
  Version eines Backups (verifiziert über alle historischen Blob-Versionen).
- **Konsequenz:** Eine Geheimnis-Rotation ist NICHT erforderlich. Das Risiko war
  strukturell (Rule-Verstoß), nicht ein tatsächlicher Leak. Diese Zeile bewusst
  ehrlich statt Panik: nichts ist ausgelaufen.

## Durchgeführte Maßnahme

- `git filter-repo --invert-paths` für alle vier Backup-Dateien über die gesamte Historie.
- Force-Push nach `main` (alt: `46c8e6d`, neu: `59dade8`). 206 Commits erhalten,
  alle Backup-Objekte aus jedem Commit entfernt.
- Verifiziert: Dumps sind aus HEAD, aus allen Branches und aus der Commit-Liste
  der API entfernt.

## Bekannte Einschränkung (ehrlich)

GitHub behält nicht erreichbare Commits bis zur internen Garbage Collection
im Cache und kann alte SHAs noch direkt ausliefern. Wer den alten SHA kennt,
kommt übergangsweise an die Objekte. Vollständige Entfernung: GitHub-Support
anfordern ("remove cached views") oder abwarten. Da die Prüfung ergab, dass die
Dumps keine sensiblen Daten enthalten, ist dieses Restrisiko akzeptabel —
dokumentiert statt schöngeredet.

## Offen

- Keine Geheimnis-Rotation nötig (siehe Prüfung).
- `db-backup.py` (Skript, keine Daten) bleibt im Repo — es ist Werkzeug, kein Backup.

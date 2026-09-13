# Sprint 85 — Persistent Disk für den Workspace-Service

**Datum:** 13.09.2026
**Ziel (Akzeptanzkriterium aus `NEXT_STEPS.md`):** Die Render-Disk-Konfiguration ist dokumentiert (Mount-Pfad, Backup-/Restore-Strategie, Migrationsplan für bestehende Workspace-Daten); die App verbindet sich gegen die persistente Variante und zeigt den produktiven Speicherpfad diagnosefähig an; der Smoke-Test des Workspace-Service läuft auf dem produktiven Pfad grün.

## 1. Was umgesetzt wurde (Entwicklungs-Anteil, commit-fertig)

| Änderung | Ort |
| --- | --- |
| Speicher-Modus-Erkennung als testbares Pure-Modul (`resolveStorageStatus`) | `workspace-service/src/storage-status.js` (+ `.d.ts`) |
| Health-Endpoint meldet `storage: { mode, persistent }` — weiterhin bewusst ohne Pfade/Secrets | `workspace-service/src/index.js` (`GET /api/v1/health`) |
| Start-Log warnt/kommentiert den Speicher-Modus (`[workspaces] Speicher-Modus: …`) | `workspace-service/src/index.js` |
| Typdeklaration `RemoteWorkspaceStorage` + optionales `storage`-Feld in `RemoteHealth` | `lib/remote-workspace-client.ts` |
| Service-Diagnose zeigt „Persistenter Speicher aktiv“ bzw. „Ephemerer Speicher (Free-Tier)“ | `app/(tabs)/index.tsx` |
| Deterministische Unit-Tests für alle Flag-/Fallback-Kombinationen | `tests/workspace-storage-status.test.ts` |
| Blueprint-Dokumentation der Disk (Mount `/data`, 1 GB Startgröße, Env-Flag) | `render.yaml` |
| Bugfix: Audit-Log schrieb literal `\n` statt Zeilenumbruch — JSONL war unparseierbar | `workspace-service/src/index.js` |

**Bewusst konservative Erkennung:** `persistent` gilt nur, wenn `WORKSPACE_STORAGE_PERSISTENT` gesetzt **und** der aufgelöste Workspaces-Pfad identisch mit dem konfigurierten Pfad ist (d. h. kein automatischer cwd/tmpdir-Fallback aktiv wurde). Sonst bleibt der Modus `ephemeral` — der Health-Endpoint soll keine falsche Sicherheit signalisieren. Ältere Service-Versionen ohne `storage`-Feld werden von der App toleriert (Feld optional).

## 2. Render-Disk-Konfiguration (bezahlter Owner-Schritt)

Buchung ausschließlich über das Render-Dashboard (Owner-Handoff), nicht über den Blueprint — `render.yaml` hält die Disk-Deklaration deshalb **auskommentiert**:

1. **Voraussetzung (Render-Docs, verifiziert 13.09.):** Persistent Disks haengen nur an **bezahlten** Web-Services — der Workspace-Service muss also zunaechst von Free auf einen bezahlten Instance-Typ (Starter) umgestellt werden (Service → Settings → Instance Type). Kosten: Starter ~$7/Monat plus $0.25/GB/Monat fuer die Disk (sekundengenau abgerechnet).
2. Render-Dashboard → Service `cybersarah-workspace` → *Disks* → *Add Disk*.
3. **Mount-Pfad:** `/data` — der Service-Default `WORKSPACES_DIR=/data/workspaces` zeigt damit auf die Disk; keine Env-Änderung an `WORKSPACES_DIR` nötig.
4. **Größe:** 1 GB Startgröße (Kosten siehe Render-Konsole; jederzeit vergrößerbar, nicht verkleinerbar).
5. Render startet den Service nach dem Anlegen der Disk automatisch neu — Achtung: Das Verzeichnis `/data` ersetzt beim ersten Mount den (leeren) Container-Pfad; Workspaces liegen erst nach dem nächsten `attach`/Clone wieder vor (siehe Migration, Abschnitt 4).
6. Danach im Service die Env-Variable setzen: `WORKSPACE_STORAGE_PERSISTENT=true` (Bestätigung, dass die Disk produktiv ist — siehe Abschnitt 5).

## 3. Backup-/Restore-Strategie

- **Primär: Git ist das Backup.** Workspace-Repositorys sind Klones von GitHub; der Sicherungspfad für Quellcode ist `git push` über die bestehenden Service-Endpunkte (`POST /api/v1/workspaces/:id/git/*`). Vor jedem Disk-Wechsel/Redeploy geänderte Dateien committen und pushen.
- **Audit-Log (`external-actions.jsonl`, liegt in `WORKSPACES_DIR`):** Nach dem Bugfix valide JSONL. Backup als manueller Owner-Schritt über die Render-Shell bzw. lokal:
  ```bash
  # Shell im Render-Dashboard (cybersarah-workspace):
  tar -czf /tmp/audit-backup.tgz "$WORKSPACES_DIR/external-actions.jsonl"
  # Download über die Render-Shell-Dateiansicht
  ```
  Restore umgekehrt per Entpacken an denselben Pfad. Das Log ist append-only — beim Restore vorhandene Zeilen behalten, Duplikate sind tolerierbar.
- **Render-Snapshots (Bonus):** Render erstellt automatisch taeglich einen Disk-Snapshot (mindestens 7 Tage verfuegbar, Restore ueber die Disks-Seite). Wichtig laut Doku: Ein Snapshot-Restore setzt die Disk auf den Stand zurueck — danach geschriebene Daten gehen verloren. Der Snapshot ersetzt kein Git-Backup, ist aber ein zweites Netz.
- **Kein weiterer Server-Zustand:** Der Service speichert bewusst keine Credentials persistent; Cloud-Provider-Keys verlässt die App nur pro Request (Header), nicht in die Disk.

## 4. Migrationsplan für bestehende Workspace-Daten

Die Free-Tier-Instanz ist ephemeral — es gibt nichts Verwertbares zu migrieren, **sofern vor dem Disk-Anlegen gepusht wurde**:

1. **Vorher (Free-Tier):** Jeden Workspace öffnen, Änderungen committen und auf GitHub pushen; offene Diff-Vorschläge exportieren.
2. **Disk buchen** (Abschnitt 2, Schritte 1–4).
3. **Nach dem Neustart:** Workspace in der App erneut öffnen (attach) — der Service klont frisch von GitHub auf die Disk; uncommittette Änderungen aus dem Ephemeral-Zustand sind danach endgültig weg (deshalb Schritt 1).
4. **Verifizieren:** Health-Check liefert `storage.mode = "persistent"` (Abschnitt 5), Datei-Editor schreibt testweise eine Datei, `git status` bleibt sauber.

## 5. Verifikation auf dem produktiven Pfad

- **Automatisiert (CI, ab diesem Sprint grün):** `tests/workspace-storage-status.test.ts` prüft die Modus-Erkennung deterministisch; der Spawn-Smoke (`tests/workspace-service-smoke.test.ts`, lokal) bleibt als Start-Regression erhalten.
- **Manuell nach der Disk-Buchung (Owner):**
  ```bash
  curl -s https://cybersarah-workspace.onrender.com/api/v1/health
  # erwartet: {"status":"ready","version":"1.0.0","storage":{"mode":"persistent","persistent":true},...}
  ```
- **In der App:** Einstellungen → Workspace-Service → Diagnose „Prüfen“: Zeile zeigt „Version 1.0.0 · Persistenter Speicher aktiv · …“.
- **Reboot-Test:** In der App eine Workspace-Datei speichern → Render-Dashboard: Manual Deploy/Neustart → Datei erneut lesen. Nur mit Disk bestanden.

## 6. Betriebshinweise mit Disk (laut Render-Doku)

- Nur **eine** Service-Instanz moeglich (kein horizontales Scaling mit Disk).
- **Keine Zero-Downtime-Deploys mehr:** Render stoppt die alte Instanz vor dem Start der neuen — wenige Sekunden Verfuegbarkeitssprung pro Deploy. Das ist ein bewusster Schutz gegen Datenkorruption.
- Disk-Groesse ist jederzeit erhoehbar (kein Downtime), aber **nicht verkleinerbar** — daher 1 GB als Startwert.

## 7. Offene Owner-Handoffs

- Render-Disk buchen (Abschnitt 2) und `WORKSPACE_STORAGE_PERSISTENT=true` setzen — beides Dashboard-Aktionen, bewusst nicht automatisiert.
- Kostenentscheidung: Disk ist bezahlt (Free-Plan-Kontingent bleibt für beide Services erhalten).

## 8. Anschlussarbeit

- `docs/render-deployment.md` (Ephemeral Storage) bei Buchung um den produktiven Modus ergänzen.
- Backup-Automatisierung des Audit-Logs (z. B. wöchentlicher tar-Export) als eigener Folge-Sprint, sobald Disk-Betriebserfahrung vorliegt.

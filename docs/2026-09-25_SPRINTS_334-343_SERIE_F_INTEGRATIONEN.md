# Sprints 334–343 — Serie F: Integrationen (25.09.2026)

## Sprint-Uebersicht
- **Sprint 334** `lib/email-attachments-logic.ts`: Anhaenge mit ehrlichen Limits
  (10 Stueck, 25 MB je Datei, 50 MB gesamt, Typ-Whitelist) und Vorlagen-Verwaltung
  mit Versionierung — unbekannte Platzhalter bleiben als [unbekannt: x] sichtbar.
- **Sprint 335** `lib/calendar-integration-logic.ts`: Termine provider-abstrahiert
  (Google/Outlook/iCal) lesen und erstellen; Lese-Fehler bleiben Fehler, nie "leer".
- **Sprint 336** `lib/webhook-ingest-logic.ts`: nutzerdefinierte Webhook-Eingaenge
  MIT Signatur-Pruefung, Feld-Whitelist und 5-Minuten-Replay-Fenster; ohne gueltige
  Signatur wird NICHT verarbeitet.
- **Sprint 337** `lib/export-center-logic.ts`: Datenexport (JSON/CSV) aller eigenen
  Daten mit Manifest je Entitaet (auch 0-Zeilen sichtbar) und CSV-Formel-Injektions-
  Schutz (=, +, -, @ werden entschärft).
- **Sprint 338** `lib/import-wizard-logic.ts`: strukturierter Import mit Validierung
  VOR dem Schreiben — pro Zeile benannte Fehler, Schreiben nur nach Bestaetigung.
- **Sprint 339** `lib/api-keys-logic.ts`: persoenliche API-Keys mit Scope-Begrenzung
  (read < write < admin), Ablauf und sofortigem Widerruf; der Key-Wert ist nur beim
  Erstellen sichtbar, danach nur ein Fingerprint-Praefix.
- **Sprint 340** `lib/api-docs-logic.ts`: API-Doku-Screen mit ehrlichen Endpunkt-
  Bloecken — Fehlerfaelle Pflicht, Luecken (fehlende Fehler-Codes, falsche Scopes)
  werden als Doku-Fehler markiert.
- **Sprint 341** `lib/outbound-webhooks-logic.ts`: Slack-/Discord-Benachrichtigungen
  mit Schweregrad-Filter; ohne Ziel heisst es ehrlich "NICHT versendet", un-
  bestaetigte Sendungen bleiben unbestaetigt; nur https ohne localhost.
- **Sprint 342** `lib/integration-diagnostics-logic.ts`: echter Probe-Call je
  Integration — nicht gelaufene Probes sind "nicht geprueft" (GRAU), nie gruen;
  Gesamturteil rot > nicht-geprueft > langsam > gruen.
- **Sprint 343** Abschluss: Doku, CHANGELOG, Tracker, Version 3.0.0, volle
  Regression.

## Ehrlichkeits-Grenzen (Kurzfassung)
- Fehler sind Fehler, leere Ergebnisse sind leer — nie vertauscht.
- Schreib-Zugaenge (Import, Webhooks, Keys) ohne gueltige Pruefung: kein Schreiben.
- Signatur und Scope begrenzen, ehe irgendwas verarbeitet wird.

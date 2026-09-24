# Sprints 324–333 — Serie E: Zuverlässigkeit & Sicherheit (25.09.2026)

## Sprint-Uebersicht
- **Sprint 324** `lib/structured-logs-logic.ts`: strukturierte Server-Logs mit
  Korrelations-ID (Level-Gate, JSON-Zeilen, grep-bare Abfrage); sensitive
  Kontext-Felder werden VOR dem Schreiben als MASKIERT markiert; ohne gueltige
  Korrelations-ID entsteht keine Log-Zeile.
- **Sprint 325** `lib/rate-limit-logic.ts`: echte Begrenzung pro Route UND Nutzer
  mit Fenster-Zaehler und ehrlichem Retry-After aus dem echten Fensterende;
  unbegrenzte Routes sind bewusst im Regelwerk sichtbar.
- **Sprint 326** `lib/rls-coverage-logic.ts`: RLS-Deckungs-Verifikation —
  sensible Entities ohne Row-Level Security sind blockierende Luecken; je Entity
  entstehen verpflichtende Testfall-Namen (inkl. FEHLT-rls-kritisch).
- **Sprint 327** `lib/backup-restore-logic.ts`: Restore-Uebung mit Beweis-Kette
  (Checksummen-Abgleich, Row-Counts, Schatten-DB, Smoke-Test); Backup vorhanden
  heisst NICHT wiederherstellbar — der Beweis verfaellt nach 90 Tagen.
- **Sprint 328** `lib/crash-classification-logic.ts`: clientseitige Fehler werden
  nach Mustern klassifiziert (netzwerk/auth/daten/third-party/frontend/unbekannt)
  mit genannter Basis; Fingerprints deduplizieren Zahlen-normalisiert.
- **Sprint 329** `lib/self-healing-patterns-logic.ts`: bekannte Fehlermuster mit
  automatischer Wiederherstellung (reconnect-db, rebuild-cache, retry-request);
  jede Heilung erzeugt eine sichtbare Log-Zeile; nach 3 Fehlversuchen
  ehrliche Eskalation zum Menschen statt weiterraten.
- **Sprint 330** `lib/dependency-audit-logic.ts`: riskante Bumps einzeln mit
  voller Regression — patch zuerst, unsicher zuletzt; Major ohne Changelog-
  Pruefung und ungetestete Bumps blockieren den Release-Vermerk beim Namen.
- **Sprint 331** `lib/secret-hygiene-logic.ts`: erweiterte Regex-Guards
  (OpenAI, Stripe, Google, AWS, Private Keys, DB-Strings, Bearer) plus
  Vault-Abdeckung — jedes Secret MUSS aus dem Vault stammen; der Guard-Scan
  ersetzt erklaermass keinen Gitleaks-Lauf.
- **Sprint 332** `lib/health-deep-check-logic.ts`: /api/ready prueft DB und
  Abhaengigkeiten MIT Timeouts — Timeout ist ein eigener Zustand (kein Erfolg
  mit langer Latenz), nicht-bereit liefert 503, niemals gelogenes 200.
- **Sprint 333** Abschluss: Doku, CHANGELOG, Tracker, Version 2.9.0, volle
  Regression.

## Ehrlichkeits-Grenzen (Kurzfassung)
- Maskiert != geloescht; unbekannt != sicher; unbegrenzt != versteckt.
- Backup ohne geuebten Restore ist ein Versprechen, kein Beweis.
- Selbstheilung stoppt bei 3 Fehlversuchen — Eskalation ist kein Scheitern,
  sondern der ehrliche Umgang mit Grenzen.

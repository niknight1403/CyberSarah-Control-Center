# Sprints 284–288: Agent-Werkzeuge & Dev-Loop-Tiefe — Modul, Werkzeuge, Tests & Doku

**Status: implementiert, getestet, produktionsbereit (24.09.2026)** — 1.572 Tests grün (188 Testdateien),
TypeScript/Lint/Build ohne Fehler.

## Was gebaut wurde

Serie A (Agent-Werkzeuge & Dev-Loop-Tiefe) erweitert den autonomen Dev-Agenten und den In-App Chat↔Preview-Zyklus um professionelle Werkzeuge und transparente Limits:

- **Sprint 284 — Live-Preview-Zyklus Chat↔Preview (`lib/live-preview-cycle-logic.ts`):** Pure View- und Zustandslogik für den Chat↔Preview-Wechsel mit ehrlichen Statusanzeigen (idle, building, updating, ready, error, offline), Verfolgung von Zustandsübergängen, Synchronisation mit Chat-Aktivitäten und Wiederherstellung ohne Zustandsverlust.
- **Sprint 285 — Multi-File-Refactoring-Werkzeug (`lib/multi-file-refactor-logic.ts`):** Atomare Transaktionsverarbeitung für zeitgleiche Änderungen an mehreren Dateien (`write` / `delete`). Bietet automatischen Rollback im Fehlerfall, Backup-Erstellung aller betroffenen Dateien und ausführliche Validierung.
- **Sprint 286 — Code-Suche-Tool (`lib/code-search-logic.ts`):** Grep-ähnliche Code-Suche für das Repository mit Unterstützung für Regex- und Textmuster, Dateimuster-Filterung (`*.ts`, `components/*`) und automatischer Syntax-Range-Extraktion (Kontextzeilen vor/nach Treffern).
- **Sprint 287 — Test-Runner-Tool (`lib/test-runner-logic.ts`):** Gezielte Vitest-Ausführung für einzelne Testdateien oder Namensfilter. Parst Konsolenausgaben deterministisch zu einer strukturierten `TestRunSummary` (Pass/Fail/Skip, Dauer, Einzelergebnisse).
- **Sprint 288 — Konfigurierbare Iterations-Limits (`lib/dev-agent-iteration-limit-logic.ts`):** Transparente und konfigurierbare Werkzeug-Iterationen (Standard: max. 8 Iterationen, Warnschwelle ab 6). Verhindert endlose Werkzeugschleifen mit klaren Abbruchgründen und Zeitstempel-Historie.

## Ehrlichkeits-Grenzen

1. **Multi-File Rollback:** Das Rollback schützt das lokale Dateisystem der Transaktion; bereits gepushte Remote-Git-Commits erfordern weiterhin explizite Git-Operationen.
2. **Code-Suche:** Die Code-Suche parst geladene Repository-Dateien; in sehr großen binären Assets wird nicht nach Text gesucht. Treffer werden aus Performancegründen auf max. 100 beschränkt.
3. **Test-Runner:** Baut auf Vitest auf. Externe Umgebungsvariablen oder fehlende Datenbanken/Mocks führen zu ehrlichen Testfehlschlägen statt simulierten Erfolgen.
4. **Iterations-Limits:** Garantiert den Abbruch nach Erreichen des Limits (1–20), um unbeabsichtigte LLM-Kosten oder Schleifen zu vermeiden.

## Testabdeckung (Vorher: 1.560 Tests in 183 Dateien | Nachher: 1.572 Tests in 188 Dateien)

- `tests/live-preview-cycle-logic.test.ts` (6): Sitzungserstellung, Zustandsübergänge, Chat-Sync, Serialisierung
- `tests/multi-file-refactor-logic.test.ts` (4): Operationen-Validierung, atomare Ausführung, automatischer Rollback, Backup-Restaurierung
- `tests/code-search-logic.test.ts` (4): Pfadmuster-Matching, Syntax-Range-Snippets, Suchtreffer-Limits, Modell-Formatierung
- `tests/test-runner-logic.test.ts` (3): Vitest-Befehlsbau, Output-Parsing, Ergebnis-Zusammenfassung
- `tests/dev-agent-iteration-limit-logic.test.ts` (3): Konfigurations-Sanitising, Iterations-Verfolgung, Warnschwellen
- `tests/dev-agent-tools-logic.test.ts` (9): Integration aller Werkzeuge, Request-Bau, Resultat-Formatierung

Gesamt: 1.572 Tests grün (188 Dateien).

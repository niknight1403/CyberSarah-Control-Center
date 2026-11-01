# Sprints 289–293: Serie A Rest & Abschluss — Werkzeuge, Retry-Semantik, Kontext-Verdichtung, Commit-Vorschau & GitHub-Sync

**Status: implementiert, getestet, produktionsbereit (24.09.2026)** — 1.589 Tests grün (192 Testdateien),
TypeScript/Lint/Build ohne Fehler.

## Was gebaut wurde

Mit Batch 2 (Sprints 289–293) wird **Serie A (Agent-Werkzeuge & Dev-Loop-Tiefe)** vollständig abgeschlossen. Der autonome Dev-Agent verfügt nun über erweiterte Fehlertoleranz, automatische Kontextverdichtung ohne Informationsverlust, eine transparente Commit-Diff-Vorschau im Chat und eine Nahtstelle für Sprint-Ziele als GitHub-Issues.

- **Sprint 289 — Werkzeug-Fehlerklassen & Retry-Semantik (`lib/tool-error-classification-logic.ts`):** Reine, deterministische Logik zur Unterscheidung fataler Fehler (`not_found`, `permission_denied`, `invalid_input`) von wiederholbaren Fehlern (`timeout`, `rate_limit`, `file_locked`, `transient_network`). Bietet ehrliche Retry-Entscheidungen mit exponentiellem Backoff und verarbeitet Retry-Limits transparent.
- **Sprint 290 — Agent-Kontextfenster-Verdichtung (`lib/agent-context-window-logic.ts`):** Automatische Erkennung drohender Token-Überläufe (Schwellenwert 75%). Verdichtet ältere Chat-Turns vor einem Überlauf in eine strukturierte Zusammenfassung und konserviert alle Dateipfade und Schlüsselentscheidungen ohne stilled Verwerfen.
- **Sprint 291 — Commit-Diff-Vorschau im Chat (`lib/commit-preview-logic.ts`):** Strukturierte Diff-Vorschau vor jedem Dev-Agent-Commit im Chat. Zeigt betroffene Dateien, Hunks mit Zeilenänderungen (+/-) und Statistiken, um ungewollte Commits zu verhindern.
- **Sprint 292 — Sprint-Ziele als GitHub-Issue (`lib/sprint-issue-bridge-logic.ts`):** Verbindet Sprint-Planung und autonome Entwicklung durch Konvertierung von Sprint-Zielen in strukturierte GitHub-Issues (mit Markdown-Checklisten), parst den echten Bearbeitungsfortschritt und steuert die vorhandenen Issue-Werkzeuge (`create_github_issue`, `close_github_issue`).
- **Sprint 293 — Serie-A-Abschluss & Validierung:** Gesamtdokumentation, Vollständigkeitsprüfung, Tracker-Aktualisierung und historische Pflege der `CHANGELOG.md`.

## Ehrlichkeits-Grenzen

1. **Werkzeug-Retry:** Exponentieller Backoff verfeinert die Anfragewiederholung bei Netzwerk- und Rate-Limit-Fehlern; fatale System- oder Berechtigungsfehler werden sofort abgebrochen, anstatt endlose Versuche zu simulieren.
2. **Kontext verdichten:** Die automatische Verdichtung konserviert extrahierte Pfade, Testergebnisse und Beschlüsse; komplexe Freitext-Zwischendialoge älterer Turns werden kompakt zusammengefasst.
3. **Commit-Diff-Vorschau:** Basiert auf der lokalen Git-Differenz im Workspace. Große Binärdateien oder nicht lesbare Binär-Assets zeigen Größenänderungen statt Text-Hunks.
4. **GitHub-Issue-Sync:** Liest und steuert GitHub-Issues über die bestehenden Repository-Werkzeuge; ohne verbundenes GitHub-Repository wird die Sync-Aktion ehrlich als nicht durchführbar gemeldet.

## Testabdeckung (Vorher: 1.572 Tests in 188 Dateien | Nachher: 1.589 Tests in 192 Dateien)

- `tests/tool-error-classification-logic.test.ts` (7): Fehlerklassifizierung, Wiederholbarkeit, Retry-Entscheidung, Backoff, Fehlerformatierung
- `tests/agent-context-window-logic.test.ts` (3): Token-Schätzung, Faktensicherung, Verdichtung alter Turns, System-Prompt-Konservierung
- `tests/commit-preview-logic.test.ts` (3): Diff-Vorschau-Bau, Blockierungs-Kriterien, Markdown-Formatierung fuer Chat
- `tests/sprint-issue-bridge-logic.test.ts` (4): Issue-Payload-Erstellung, Checklisten-Parsing, Sync-Aktions-Ermittlung, Report-Formatierung

Gesamt: 1.589 Tests grün in 192 Testdateien.

# Sprint 91 — Qualitätsinfrastruktur: Secret-Scanning, Dependabot, Test-Coverage

**Datum:** 14.09.2026 · **Status:** Abgeschlossen · **Ziel:** Kostenlose Qualitäts-Werkzeuge in die CI integrieren, um die Entwicklungsqualität systematisch zu steigern.

## Ausgangslage

Die CI (`ci.yml`) prüfte bereits TypeScript, die 592 Testfälle, Workspace-Service-Build und Release-Audit. Offen waren drei disziplinierende Rückmeldeschleifen: (1) ein Secret-Scanner, der geleakte Keys erkennt, bevor sie im Verlauf landen, (2) ein automatischer Dependency-Update-Strom statt manueller Major-Sprints für alles, (3) messbare Test-Abdeckung, damit „welche Logik ist ungetestet" keine Schätzung bleibt.

## Umsetzung

### 1. Gitleaks Secret-Scanning (`.github/workflows/gitleaks.yml`)

- Läuft auf jedem Push (alle Branches) und jedem PR gegen `main`/`next-development`.
- Scannt mit vollem Verlauf (`fetch-depth: 0`), damit auch historische Leaks auffallen.
- Blockiert die CI bei Funden (streng, bewusst: produktive Stripe-/Provider-/GitHub-Keys im Projekt).
- Vollständig kostenlos (OSS); `GITHUB_TOKEN` genügt, kein weiteres Setup.

### 2. Dependabot (`.github/dependabot.yml`)

- Wöchentlich (montags) für: npm (Repo-Wurzel), npm (workspace-service), GitHub Actions.
- Gruppierung: Expo/Metro/NativeWind gemeinsam (Breaking Changes in einem Review), React-Native-Familie gemeinsam, Dev/Test-Tooling gemeinsam.
- Expo-SDK-Major-Sprünge werden ignoriert — sie bleiben eigene Sprints (Grundentscheidung, siehe NEXT_STEPS Sprint 87).
- Commit-Präfixe `chore(deps)`, `chore(deps-workspace-service)`, `chore(ci-deps)`.

### 3. Test-Coverage für die Logik-Suite

- `@vitest/coverage-v8@^4.1.11` als devDependency (exakt passend zur Vitest-Version, Lockfile aktualisiert).
- Neues Script `npm run test:coverage` (`vitest run --coverage`).
- `vitest.config.ts`: Coverage über den v8-Provider, gemessen nur über echtes Projektgut (`lib/`, `server/`, `shared/`, `scripts/`); Tests, Stubs und Typdeklarationen ausgeschlossen. Reporter: `text` (CI-Log), `json-summary` (maschinenlesbar für spätere Gates), `lcov` (Uploader).
- CI: der Testschritt heißt jetzt „Deterministic test suite mit Coverage" — ein Lauf misst beides, keine verdoppelte Laufzeit. Der Coverage-Bericht liegt als Artifact `cybersarah-coverage-<run-id>` bereit.
- Optionaler Codecov-Upload: nur aktiv, wenn das Secret `CODECOV_TOKEN` gesetzt ist; ohne Token informiert der Schritt und bleibt grün. Codecov ist für private Repos bis 5 Nutzer kostenlos (https://about.codecov.io).

## Manuelle Handoff-Punkte (Nutzeraktionen)

1. **Codecov (optional):** Konto anlegen, Repo verbinden, `CODECOV_TOKEN` als GitHub-Secret hinterlegen. Ohne Token funktioniert die Coverage-Messung trotzdem (Artifact).
2. **CodeRabbit (empfohlen):** GitHub App installieren (https://github.com/apps/coderabbit/installations — kostenlos auch für private Repos). AI-Review kommentiert dann automatisch jeden PR.
3. **UptimeRobot (empfohlen, Betrieb):** https://uptimerobot.com — 50 Monitore gratis, 5-Min-Intervall. Monitor auf `https://app.cybersarah-ki.com/api/health` anlegen, E-Mail-Alert aktivieren.
4. **Snyk (optional):** https://snyk.io — 200 Dependency-/100 SAST-Scans pro Monat gratis; GitHub-Integration anstoßen.

## Coverage-Baseline (Messung vom 14.09., Grundlage fuer spaetere Gates)

- Zeilen: **50,55 %** · Funktionen: **56,23 %** · Branches: **49,85 %** · Statements: 49,95 %
- Bewertung: Fuer eine Logik-Suite ohne Komponenten-/Screen-Tests solide; die auffaelligen Restbereiche sind UI-nahe Praesentationsmodule und die grossen Server-Dateien, die nur ueber Smoke-Tests abgedeckt sind. Erst einige Sprints beobachten, dann Mindest-Schwellen als Gates festlegen.

## Akzeptanzkriterien (Stand bei Abschluss)

- TypeScript sauber (`npm run check`), Tests grün (`npm run test:coverage`), Server-Build erfolgreich — verifiziert vor Push.
- Keine Secrets im Code; Gitleaks-Workflow enthält keinerlei Credentials.
- `ci.yml` weiterhin schlank: ein Testlauf (jetzt mit Messung), keine Verdopplung.
- Lockfile konsistent (`@vitest/coverage-v8` installierbar via `npm ci`).

## Abgrenzung / bewusst NICHT gemacht

- Keine Coverage-Gates (Mindest-Abdeckung, die Builds blockiert) — erst Basiswerte über einige Sprints beobachten, dann Schwellen festlegen.
- Kein Sentry-Rollout — Betriebsthema, separater Sprint, wenn Error-Daten aus dem Realgerät-Test vorliegen.
- Kein Umbau der Release-Audit-Pipeline — die neuen Werkzeuge laufen ergänzend und blockierend parallel.

# CyberSarah – Zehn integrierte Growth-Sprints

Stand: 30.10.2026. Branch: feat/growth-reliability-ten-sprints-20261030. PR #134 (Draft bis CI). 

## Durchgeführte Entwicklungsziele

### Sprint 01: Datenvalidierung

Nichtfinite, negative, gebrochene Zähler verhindern das Erzeugen neuer Growth-Entwürfe; Quellenabweichungen erscheinen als Warnung.

Code/Regression: `lib/growth-data-quality.ts;server/always-on-growth.ts;tests/growth-data-quality.test.ts`

### Sprint 02: Refund-Schutz

Stark erhöhter Refund-Anteil stoppt neue Wachstumsexperimente und priorisiert Angebots-/Supportanalyse.

Code/Regression: `lib/growth-refund-guard.ts;server/always-on-growth.ts;tests/growth-refund-guard.test.ts`

### Sprint 03: Reichweiten-Provenienz

Ungültige Plattformmesswerte werden verworfen; überlappende Event-/Plattformquellen nicht blind addiert.

Code/Regression: `lib/channel-metric-source.ts;server/channel-autopilot.ts;tests/channel-metric-source.test.ts`

### Sprint 04: Queue-Vollständigkeit

Queue-/Experimentbestände werden mit SQL-Zählungen vollständig ermittelt; abgeschnittene Publishing-Historie sperrt unzuverlässige Growth-Entwürfe.

Code/Regression: `server/channel-autopilot.ts;lib/growth-data-quality.ts;tests/growth-data-quality.test.ts`

### Sprint 05: Echter Laufzeitstatus

Ein Heartbeat zeigt tatsächliche Abschlüsse, Fehlerfolgen und veraltete Läufe, aber keine garantierte 24/7-Uptime.

Code/Regression: `lib/growth-runtime-state.ts;server/always-on-growth.ts;tests/growth-runtime-state.test.ts`

### Sprint 06: Doppelläufe verhindern

Admin- und Cron-Aufrufe starten im Prozess nicht gleichzeitig denselben Growth-Lauf; vorhandene DB-Locks bleiben für mehrere Instanzen.

Code/Regression: `lib/growth-execution-guard.ts;server/always-on-growth.ts;tests/growth-execution-guard.test.ts`

### Sprint 07: Cron-Datenschutz

GitHub-Actions-Logs veröffentlichen keine rohen Response-Daten mehr; POST-Aufrufe werden nicht unkontrolliert wiederholt.

Code/Regression: `.github/workflows/control-center-autopilot.yml;tests/growth-cron-workflow.test.ts`

### Sprint 08: Wachstumstrends

Reichweite und Netto-Umsatz werden als 7-Tage-Tagesdurchschnitt gegen die vorherigen 23 Tage bewertet, ohne künstliche Erfolgsprognosen.

Code/Regression: `lib/growth-trend-logic.ts;server/always-on-growth.ts;tests/growth-trend-logic.test.ts`

### Sprint 09: Mobile Admin-UX

Status, Fehler, letzter Lauf, Trend und fragliche Daten werden auf der Revenue-Karte angezeigt; gesperrte Auslösung erkennbar.

Code/Regression: `lib/growth-admin-status.ts;components/glass/revenue-autopilot-card.tsx;tests/growth-admin-status.test.ts`

### Sprint 10: Release-Gates

Ein wiederholbarer Sicherheitscheck ist als npm-Skript vorhanden und fester Bestandteil des CI-Laufs.

Code/Regression: `scripts/growth-release-audit.mjs;package.json;.github/workflows/ci.yml`

## Einheitliche Abnahmeregeln

- Ein Sprint besteht aus einem integrierten Nutzer- oder Betriebsziel und einem reproduzierbaren Nachweis, nicht nur aus einem Commit.
- `npm run check`, `npm run lint`, `npm run audit:growth` und `npm run test:coverage` müssen für den **letzten Commit** erfolgreich sein. Gitleaks ebenso.
- Alle automatisierten Growth-Aktionen bleiben auf Analyse und überprüfbare Pending-Drafts begrenzt. Kein automatischer Werbekauf, keine Preisänderung, keine Veröffentlichung ohne Freigabe.
- Der GitHub-Cron läuft planmäßig alle zwei Stunden; der inaktive Render-Free-Service kann schlafen. Das ist kein garantierter 24/7-Worker.
- Der 7/30-Tage-Trend ist beobachtend und nicht kausal. Reichweiten-, Zahlungs- und Umsatzdaten können je Plattform unvollständig oder zeitverzögert sein.

## Nach dem Merge

1. Render-Deploy auf den gemergten SHA prüfen. Bei fehlendem Auto-Deploy-Trigger nicht „live“ behaupten.
2. HTTPS `/api/health` und das authentifizierte Administrator-`growthOverview` auf Funktionsfähigkeit prüfen, ohne Tokens in Logs auszugeben.
3. Cron-Historie auf echte erfolgreiche POSTs kontrollieren. Bei DB- oder Providerfehlern Ursachen dokumentieren.
4. Mindestens einen echten mobilen Android-Navigationstest und einen kontrollierten Growth-Lauf mit realer Datenquelle durchführen, bevor produktiv von „alles grün“ gesprochen wird.
5. Rollback über Merge-Revert bzw. `GROWTH_PULSE=off` und `CHANNEL_AUTOPILOT=off`; andere unabhängige Module können weiterlaufen.

**Noch offen:** Echte Plattform-/Stripe-End-to-End-Prüfung, dauerhafte Worker-Verfügbarkeit und neuer signierter Android-APK-Release. Keine behaupteten Umsatzsteigerungen ohne belegte Messung.

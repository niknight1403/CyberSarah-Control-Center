# CyberSarah Growth Pulse 24/7 – integrierte Umsatz- und Reichweitensteuerung

## Ziel und Architektur

Bestehende Module wiederverwenden statt Parallelagenten zu bauen:
- `server/channel-autopilot.ts`: realer 15-Minuten-Timer im laufenden Serverprozess, gemessene Reichweiten- und Funnel-Signale, deduplizierte Content- und Revenue-Entwürfe.
- `server/revenue-autopilot.ts`: reale Funnel-/Abo-/Affiliate-Signale und begrenzte Revenue-Experimente.
- `server/control-center-autopilot.ts`: HARA/Expansion-Scans, Revenue-, Draft- und B2B-/Influencer-Lernen; neu: Growth Pulse.
- `.github/workflows/control-center-autopilot.yml`: serverunabhängiger GitHub-Cron alle 2 Stunden, authentifiziert mit serverseitigem METRICS_TOKEN; kein offener Trigger.
- `server/always-on-growth.ts`: Wachstumspuls auf Basis des vorhandenen Channel-Snapshots, führt den bestehenden idempotenten Channel-Lauf aus, erzeugt keine zusätzlichen Publishing-Engines.

## Was autonom geschieht

1. Echte Impressionen, Views, Klicks, Leads, Käufe, Refunds und Publishing-Fehler erfassen.
2. Engpass priorisieren: Queue-Stau, Publishing-Reliabilität, organische Reichweite, Hook, CTA, Landingpage, Angebot oder fehlende Profit-Evidenz.
3. Bestehende Channel-Engine kontrolliert starten und höchstens dort begrenzte Content-/Revenue-Entwürfe in die vorhandene Freigabe-Queue aufnehmen.
4. Bestehende Influencer-Lerneinheit und Revenue-Signale wiederverwenden.
5. Im Revenue-Autopilot-Dashboard echte Metriken, Priorität, Datenqualität und nächste Aktion anzeigen.
6. Per Administratoraktion einmalig neu analysieren, ohne bezahlte Werbung, Preise, externe Posts oder E-Mails ungeprüft auszulösen.

## Betriebsgrenzen

- Keine Umsatz-/Gewinngarantie. Netto-Umsatz ist nicht Deckungsbeitrag und kein belegter Gewinn.
- Veröffentlichung, Direktnachrichten, E-Mail-Outreach, Budgetausgaben und produktive Stripe-Preiswechsel erfordern explizite Freigaben.
- Unzureichende Messbasis führt zu „Reichweite messen“ statt zu erfundenen Wachstumsbehauptungen.
- Bei zu vielen offenen Entwürfen/Experimenten stoppt das Wachstumssignal die zusätzliche Content-Produktion.
- Wiederholung über GitHub Actions schützt gegen Server-Schlaf, aber GitHub-Cron kann verspätet sein oder ausfallen. Ein 24/7-Service-Level erfordert einen dauerhaft laufenden Worker mit Monitoring.
- Keine garantierte tägliche Veröffentlichungsfrequenz: Plattformanbindungen, Rechte und Freigaben müssen nachgewiesen werden.

## Technische Abnahme

- `tests/always-on-growth-logic.test.ts`: zehn Fälle zu Funnel-Prioritäten, fehlender Profit-Evidenz, Datenmangel und Freigaben.
- `tests/control-center-autopilot.test.ts`: Regression des übergreifenden Control Loops einschließlich Growth und nachvollziehbarer Blockaden.
- `server/channel-autopilot.ts`: nur tatsächlich per DB bestätigte neue Drafts zählen, keine Erfolgszahlen bei `onConflictDoNothing`.
- `npm run check`, `npm run lint`, `npm test`, Secret Scan, Build und gerätebasierte Android-End-to-End-Prüfung müssen vor produktivem Release erfolgreich sein.

## Deployment

Änderungen zunächst ausschließlich im Feature-PR, kein direkter Push auf main. Bestandsgeheimnisse bleiben auf Render serverseitig gespeichert. Nach erfolgreicher CI zusätzlich echten `api/cron/control-center-autopilot`-Lauf und Freigabequeue im Testmodus kontrollieren.

## Verbesserte Entwicklungsgeschwindigkeit und Qualität

Eine zentrale Agentenpipeline statt duplizierter Dienste; deterministische, messbare Entscheidungsmatrix; neue Regressionstests und PR-CI-Gates für schnelle, überprüfbare Releases. Einen Sprint nur dann abschließen, wenn Codes, Tests und Nachweise vorliegen.
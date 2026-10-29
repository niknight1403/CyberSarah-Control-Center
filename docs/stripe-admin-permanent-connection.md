# CyberSarah – Stripe als dauerhafte Administrator-Integration

Stand 2026-10-29. Code liegt in Draft-PR #130. Der Render-Service heisst cybersarah-control-center (My Workspace).

## Architektur

- Ein Stripe-Konto mit einem zentral serverseitig hinterlegten STRIPE_SECRET_KEY und STRIPE_MODE (test oder live). Keine Speicherung in Android AsyncStorage, Browser oder Git.
- Das Secret wird als persistente Render-Umgebungsvariable verwaltet. GitHub-Deploys mit fehlenden Stripe-Secrets erhalten den existierenden Render-Wert, statt ihn durch ein PUT aller ENV-Variablen zu verlieren.
- Das Stripe-Webhooksignatur-Secret liegt getrennt als STRIPE_WEBHOOK_SECRET. Bereits vorhandener Webhook-Endpunkt: POST /api/billing/stripe/webhook. Nur signierte Events werden verarbeitet.
- Administrationsfunktionen liegen hinter adminProcedure und verlangen eine eingeloggt verifizierte Admin-Rolle.
- Server prueft Stripe-Produkte/Preise mit rein lesenden API-Abfragen. Der Status verrät weder Schluessel noch Webhook-Secret noch deren Fragmente.
- Der Produktkatalog wird nach Neustarts ohne erneutes Login eingelesen, wenn STRIPE_CATALOG_AUTO_SYNC=on. Alle 6 Stunden werden neue Produktangebote als lokale Drafts synchronisiert. Keine Stripe-Preis- oder Produkt-Aenderungen, keine Zahlungen, keine Publikationen.
- Der Admin-Bereich in Commerce Studio zeigt Verbindungsstatus, Betriebsmodus, Leserechte, Konfiguration des Signatur-Secrets und letzte Synchronisation.

## Einmalige Voraussetzungen

1. In Render -> My Workspace -> cybersarah-control-center -> Environment den STRIPE_SECRET_KEY mit der benoetigten Berechtigung fuer products.list und prices.list hinterlegen. Keine Keys in Chatnachrichten schicken.
2. STRIPE_MODE muss exakt zum Key passen (sk_test_/rk_test_ oder sk_live_/rk_live_). Zu stark eingeschraenkte Restricted Keys melden fehlende Produkt-/Preise-Leserechte; fuer Checkout sind gesonderte Zugriffsrechte erforderlich.
3. Im Stripe Dashboard einen Webhook-Endpunkt https://cybersarah-control-center-hmlc.onrender.com/api/billing/stripe/webhook konfigurieren, Events aus der bestehenden Billing-Implementierung abonnieren und das zugehoerige STRIPE_WEBHOOK_SECRET einmalig auf Render speichern.
4. Die bereits gesetzte Render-ENV STRIPE_CATALOG_AUTO_SYNC=on bleibt bei Deploys persistent. Ein neuer Feature-Build muss in main integriert und bereitgestellt sein, bevor der neue Autopilot tatsaechlich laeuft.
5. In der Administratoransicht Commerce Studio -> Stripe-Verbindung pruefen klicken. Die App verlangt danach keinen erneuten Stripe-Login; die Konfiguration wird beim Backend-Neustart wiederverwendet.

## Nachweise und Grenzen

- Der vorhandene Billing-Code erzeugt Checkout-Sessions und verarbeitet signierte Webhooks. Das Katalogsync selbst ist ausschließlich read-only.
- Der Verbindungscheck prueft Produkt- und Preislesezugriff. Das Vorhandensein von STRIPE_WEBHOOK_SECRET beweist noch keine erfolgreiche Webhook-Zustellung, und der Katalog-Lesecheck beweist keinen erfolgreichen Checkout.
- Bei fehlendem STRIPE_SECRET_KEY kann ChatGPT den Stripe-Schluessel weder erraten noch ohne Freigabe vom Stripe-Konto beziehen. Einmaliges Hinterlegen in Render ist dann unumgaenglich.
- Test-/Live-Key-Wechsel nur gemeinsam mit bewusstem Moduswechsel, keine automatische Umschaltung auf ein unbekanntes zweites Stripe-Konto.
- Auf Render Free kann ein Dienst schlafen; alle 6 Stunden ist daher ein Intervall fuer laufende Prozesse, kein Garant fuer durchgehende 24/7-Ausfuehrung.
- Vor produktivem Zahlungsverkehr: Stripe Test-Mode Checkout, Webhook-Signatur, doppelte Events, Rechnungen, Widerruf, Betrugs- und Refundpfade E2E pruefen.

## Rollback

- STRIPE_CATALOG_AUTO_SYNC=off stoppt die automatische Katalog-Synchronisation nach Neustart. Vorhandene Stripe-Schluessel bleiben unveraendert.
- Die Admin-Verbindung und Billing-Webhooks bleiben intakt; der Import kann manuell ausgeloest werden.
- Bestehende Stripe-Transaktionen oder Bestandsabonnements werden vom Import weder bearbeitet noch geloescht.

## Implementierung

- lib/render-deploy-logic.mjs: mergePersistedRenderEnvVars.
- scripts/render-deploy.mjs: sicheres Merge aller Render-Env-PUTs vor dem Replace.
- lib/stripe-admin-status-logic.ts: serverseitige Modus-/Schluessel-Plausibilitaet.
- server/stripe-admin-integration.ts: adminabhängige API-Verifikation, Sync und 6h-Scheduler.
- server/commerce-studio-autopilot-router.ts + app/commerce-studio.tsx: Administrator-Schnittstelle und mobile Bedienung.
- Tests: tests/render-stripe-persistence.test.ts, tests/stripe-admin-status-logic.test.ts.
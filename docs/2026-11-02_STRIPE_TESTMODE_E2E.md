# Stripe-Testmodus-E2E (Sprint 9) — Nachweis vom 02.11.2026

## Was bewiesen ist

Ein vollstaendiger Kundenweg mit **echten Stripe-Objekten im Testmodus** bis
zur Umsatz-Attribution in der Datenbank:

| Schritt | Beleg |
| --- | --- |
| Kunde + Auftrag | `ait-13fb50ec-b91a-4ace-a0c4-8d2eefb48ca5`, Start bei `market-analysis` |
| Freigaben bis Zahlung | Auftrag steht bei `payment-pending` |
| Stripe Subscription | Testkunde, Preis 999,00 EUR/Monat, `tok_visa` als Zahlungsmittel |
| Invoice | `in_1UXBbGAuUge07PL9YJg5Giqv`, Status `paid`, 999,00 EUR |
| Unsere Verarbeitung | `syncAiInfluenzaSubscription` -> `orderUpdated: true`, `recordAiInfluenzaInvoice` -> `recognizedRevenueCents: 99900` |
| Datenbank | Auftrag `step=paid`, `paymentStatus=paid`, 3 Task-Zeilen / 33 Einheiten (12 Short-Video, 20 Content-Post, 1 Monatsreport), Attribution 999,00 EUR |
| Aufraeumen | Subscription storniert, Testkunde geloescht |

Damit ist die Kette Auftrag -> Zahlung -> Freigabe der Produktion -> Umsatz
durchgehend belegt, und zwar ohne echtes Geld: alle Objekte entstanden im
Stripe-Testmodus (`sk_test_…`), der Live-Key wird nicht verwendet.

## Schutzregeln im Skript

- Das Skript verweigert jeden Key ohne Test-Praefix und fragt zusaetzlich
  `livemode` bei Stripe ab. Ein Live-Key bricht den Lauf ab.
- Die Datenbank-URL muss auf `127.0.0.1`/`localhost` mit der Datenbank
  `influenza_stripe_ci` zeigen, damit nie versehentlich Produktionsdaten
  beschrieben werden.
- Der Auftrag erreicht `paid` ausschliesslich ueber das verifizierte
  Stripe-Ereignis, nicht durch manuelles Setzen.

## Reproduktion

Der Workflow `.github/workflows/ai-influenza-stripe-e2e.yml` ist nur manuell
ausloesbar. Er braucht das Repository-Secret `STRIPE_TEST_SECRET_KEY`
(Test-Key `sk_test_…`), damit der Live-Key unberuehrt bleibt.

Lokal ohne Docker/Postgres laeuft derselbe Nachweis gegen eine
In-Process-Postgres (PGlite mit pg-Protokoll-Socket):

```bash
npm install --no-save @electric-sql/pglite @electric-sql/pglite-socket
node pgserver.mjs   # PGLite auf 127.0.0.1:5433, maxConnections > 1
AI_INFLUENZA_INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/influenza_stripe_ci \
  npx tsx scripts/test-ai-influenza-stripe-test-mode-e2e.ts
```

Wichtig: PGlite verkraftet standardmaessig nur **eine** Verbindung, deshalb
`maxConnections` setzen — sonst bricht die Verbindung mit
"Connection terminated unexpectedly" ab.

## Offener Punkt

Das Secret `STRIPE_TEST_SECRET_KEY` konnte ich nicht selbst anlegen (der
GitHub-Token darf keine Secrets schreiben, die API antwortet mit HTTP 400).
Bis das Secret existiert, laeuft der Nachweis lokal, nicht in der CI.

# Umsatz-Konnektoren und Konto-Agent

## Was neu ist

| Baustein | Datei | Zweck |
|---|---|---|
| Konnektor-Logik | `lib/revenue-connectors-logic.ts` | Statuspruefung, HubSpot-Batching, SSRF-Schutz, Outreach-Regeln, Stripe-Metering |
| Konto-Agent | `lib/account-agent-logic.ts` | Konto-Katalog, Entwuerfe, Pruefung, Maskierung, Einrichtungsanleitungen |
| Kennzahlen | `lib/revenue-metrics-logic.ts` | MRR, ARR, Conversion, Signup-Rate, API-Nutzung |
| Inhalte | `lib/content-distribution-logic.ts` | Case Studies, Release Notes, Freigabe, Wochenplan |
| Endpunkte | `server/revenue-integrations-router.ts` | tRPC-Verfahren (alle Admin) |

Alle Funktionen sind rein: sie liefern Plaene und Pruefungen, keine externen Schreibzugriffe.
Echte Aufrufe bleiben an den bestehenden, freigabepflichtigen Modulen
(`sendApprovedEmail`, `sendStripeMeterEvent`).

## Endpunkte (Admin)

| Verfahren | Typ | Zweck |
|---|---|---|
| `revenueIntegrations.accountProviders` | Query | Anbieter-Katalog und Einrichtungsanleitungen |
| `revenueIntegrations.accountCreate` | Mutation | Konto-Eintrag anlegen, naechster Schritt |
| `revenueIntegrations.accountReview` | Query | Zugangsdaten pruefen (maskiert) |
| `revenueIntegrations.accountTemplate` | Query | Schritte und ENV-Vorlage je Anbieter |
| `revenueIntegrations.connectorCatalog` | Query | Konnektoren und Bereitschaft |
| `revenueIntegrations.connectorReadiness` | Query | Status eines Konnektors |
| `revenueIntegrations.crmSyncPlan` | Mutation | HubSpot-Batches (100er) |
| `revenueIntegrations.scrapeGuard` | Mutation | URL-Pruefung vor dem Scraping |
| `revenueIntegrations.outreachPlan` | Mutation | Einwilligung, Sperrliste, Ratenlimit |
| `revenueIntegrations.meteredEventPlan` | Mutation | Idempotentes Stripe-Meter-Ereignis |
| `revenueIntegrations.mrrSnapshot` | Query | MRR, ARR, Conversion, API-Nutzung |
| `revenueIntegrations.contentDraftAuto` | Mutation | Entwurf erzeugen |
| `revenueIntegrations.contentApprove` | Mutation | Freigabe mit Zeitpunkt |
| `revenueIntegrations.contentSchedule` | Query | Naechster Wochenlauf (Montag 09:00 UTC) |

## Konto-Agent: Grenzen und Ablauf

Der Agent legt **keine** Konten bei fremden Anbietern an. Eine Registrierung
erfordert eine bestaetigte E-Mail-Adresse und die Zustimmung des Inhabers.
Er fuehrt den Katalog, prueft hinterlegte Zugangsdaten, maskiert Geheimnisse
und liefert die exakten Schritte:

1. `accountProviders` aufrufen und Anbieter waehlen.
2. `accountCreate` legt einen Entwurf an und nennt fehlende Angaben.
3. Zugangsdaten im Anbieter erzeugen (Link in `accountTemplate`).
4. Werte als Umgebungsvariablen setzen (verschluesselt im Control Center).
5. `accountReview` pruefen: `ready: true` bedeutet einsatzbereit.

## Live-Schaltung

**HubSpot**
- Private App anlegen, Berechtigungen: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`.
- `HUBSPOT_PRIVATE_APP_TOKEN=pat-…` setzen.
- Test: `connectorReadiness { key: "hubspot" }` liefert `configured: true`.

**Firecrawl**
- `FIRECRAWL_API_KEY=fc-…` setzen.
- Jede URL laeuft zuerst durch `scrapeGuard`: nur HTTPS, keine internen Adressen.
- Ergebnisse bleiben bis zur menschlichen Pruefung Entwuerfe.

**Outreach (Resend)**
- Domain im Anbieter verifizieren (SPF, DKIM), `RESEND_API_KEY` und `OUTREACH_FROM_ADDRESS` setzen.
- Versand nur mit `consentGiven: true`, ohne Sperrliste, maximal 50 Empfaenger pro Lauf.

**Stripe Metered Billing**
- `STRIPE_SECRET_KEY`, `STRIPE_METER_EVENT_NAME` (z. B. `api_call`) setzen.
- Webhook im Dashboard auf `https://<host>/api/stripe/webhook` zeigen lassen, `STRIPE_WEBHOOK_SECRET` eintragen.
- Ereignisse tragen eine deterministische Kennung (`vf_…`) und sind damit wiederholsicher.

**Apollo.io**
- `APOLLO_API_KEY` setzen; nur lesende Nutzung fuer die Anreicherung.

## Betrieb

- Woechentlicher Content-Lauf: `contentSchedule`, Veroeffentlichung erst nach `contentApprove`.
- Kennzahlen: `mrrSnapshot` mit Abo-, Funnel- und Nutzungsdaten aufrufen; ohne Daten liefert es Nullen statt Schaetzwerten.

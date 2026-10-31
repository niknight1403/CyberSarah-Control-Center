# CyberSarah Revenue / Integration Roadmap

## Current evidence / gaps
Existing Stripe metering **pure logic**, billing/webhook modules, admin integration pages,
B2B growth network and outreach logic exist. Live external CRM sync, verified Firecrawl
scraping, approved outbound email transport, durable metered billing dispatch and real
time MRR source of truth were **not** present as one integrated production path.

## Priorities and implementation
1. **HubSpot CRM** read-only contacts/deals preview via v3 API (implemented).
   Next: OAuth/PAT setup, encrypted per-tenant credentials and checkpoint-based sync.
2. **Firecrawl** allowlisted HTTPS company-page preview (implemented).
   Next: DNS/private-address SSRF protections, robots/ToS compliance and human-reviewed
   company qualification before storing any personal data.
3. **Resend** consent-gated email adapter (implemented, **not** wired for automated send).
   Next: durable approval records, unsubscribe links, suppression lists, bounce webhooks,
   sending-domain verification and rate limits before enabling API mutations.
4. **Stripe Meter Events** validated HTTP adapter (implemented, **not** wired into
   automatic billing). Next: durable unique usage ledger, customer/meter mapping,
   replay-safe transport, Stripe webhook reconciliation and billing dispute handling.
5. **Admin tRPC preview** readiness, CRM, website, draft content and **explicitly
   supplied** KPI inputs (implemented; these are **not real-time revenue metrics**).
6. **HubSpot MCP / Apollo / Outreach**: not connected. Require independent
   permission scopes, GDPR/ePrivacy review, quotas and consent/provenance storage.
7. **Weekly schedule**: marketing content drafts available; scheduler and publishing
   approval remain outstanding.
8. **Go-live and operations**: no API secrets hardcoded, no real contact or billing
   calls in tests. Configure secrets, smoke-test providers in sandbox, validate
   docker/PM2, perform E2E and confirm deployment status before enabling writes.

## Required configuration (server-side)
HUBSPOT_ACCESS_TOKEN, FIRECRAWL_API_KEY, RESEND_API_KEY,
STRIPE_SECRET_KEY, verified RESEND_FROM_EMAIL, Stripe meter name/customer mapping.
The existing production deploy workflow must explicitly forward newly introduced
provider secrets to Render; do **not** display the values in logs.

## Umsetzung 2026-11-01 (abgeschlossen)

Die Umsatz-Konnektoren sind als geprueftes Paket umgesetzt und getestet:

- `lib/revenue-connectors-logic.ts` — Bereitschaft, HubSpot-Batching (100er), SSRF-Schutz
  fuer Scraping (nur HTTPS, keine internen Adressen), Outreach-Regeln (Einwilligung,
  Sperrliste, Wegwerf-Domains, 50 pro Lauf), idempotente Stripe-Meter-Ereignisse.
- `lib/account-agent-logic.ts` — **Konto-Agent**: Katalog der fuenf Anbieter, Konto-Entwuerfe
  mit fehlenden Angaben, maskierte Pruefung der Zugangsdaten, Einrichtungsanleitungen mit
  Berechtigungen und ENV-Vorlagen.
- `lib/revenue-metrics-logic.ts` — MRR inkl. Jahresabo-Umrechnung, ARR, Conversion- und
  Signup-Rate, API-Nutzung im 30-Tage-Fenster.
- `lib/content-distribution-logic.ts` — woechentliche Case Studies und Release Notes mit
  Freigabepflicht und Terminierung auf Montag 09:00 UTC.
- `server/revenue-integrations-router.ts` — 14 Admin-Verfahren, siehe `docs/revenue-integrations.md`.

Teststand: 2.835 Tests in 389 Dateien gruen, `tsc --noEmit` ohne Fehler,
`npm run build` erzeugt `dist/index.js`, PM2- und Docker-Konfiguration validiert.

Offen bleiben die menschlichen Schritte: Anbieter-Konten anlegen, Zugangsdaten
hinterlegen, Domain verifizieren, Webhook registrieren. Details in
`docs/revenue-integrations.md`.

# AI Influenza Team — Repository-Audit und Integrationsplan (Sprint 1)

**Datum:** 02.11.2026
**Basis:** `main` @ `496346a`
**Auftrag:** AI Influenza Team als eigenständige Umsatzsparte im CyberSarah Control Center
**Ergebnis dieses Sprints:** belegter Ist-Stand, Lückenmatrix, Plan bis zum ersten buchbaren Angebot

> Grundregel dieses Dokuments: nur was im Code und in Tests nachweisbar ist, gilt als
> vorhanden. Alles andere steht unter Lücke, auch wenn es im Changelog oder in einem
> Release-Request behauptet wird.

## 1. Kurzbefund

Die Business Unit existiert bereits zu großen Teilen. Phase 7 wurde am 01.11.2026
auf `main` gebracht: 8 Agenten, 3 Pakete, Stripe-Checkout über die vorhandene
Integration, Auftrags-/Task-Engine auf `revenue_jobs`, Lead-Pipeline,
Kosten-/Profit-Auswertung, ein mobiler Tab und 13 grüne Tests.

Was fehlt, ist nicht das Datenmodell, sondern der **betriebliche Nachweis**:
eine durchgängig belegte Kundenreise gegen echte Persistenz, die zehn geforderten
Dashboard-Ansichten, ein tatsächlich terminierter Autopilot und die automatische
Kostenmessung pro Auftrag.

## 2. Belegter Ist-Stand

| Baustein | Beleg | Zustand |
|---|---|---|
| 3 Pakete mit 299 / 999 / 2.499 € | `lib/ai-influenza-team-logic.ts:16,26,36`, inkl. `hypothesisNotice` | vorhanden |
| 8 Agenten mit Mission und Capabilities | `lib/ai-influenza-team-logic.ts:62-69`, alle `externalActionAllowed:false` | vorhanden |
| Autonomie-Modi manual / assisted / autopilot, Default `assisted` | `lib/ai-influenza-team-logic.ts:79-99` | vorhanden |
| Stripe-Checkout, Preis-ID-Validierung, `price_data`-Fallback | `server/ai-influenza-team-router.ts:35`, `lib/...team-logic.ts:162-171` | vorhanden |
| Billing-Portal | `server/ai-influenza-team-router.ts:60` | vorhanden |
| Verifizierte Webhook-Synchronisation (Abo + Rechnung) | `server/billing.ts:329,461` → `server/ai-influenza-stripe-sync.ts` | vorhanden |
| Aufträge / Tasks / Dedupe auf `revenue_jobs` | `server/ai-influenza-team-service.ts:25,125,151` | vorhanden |
| Lieferplan, Lieferstatus, Task-Draft-Generierung | `server/ai-influenza-delivery-service.ts:14,22,77` | vorhanden |
| Lead-Pipeline mit Kontaktbasis inkl. `opted-out` | `lib/ai-influenza-lead-logic.ts:1`, `server/ai-influenza-lead-service.ts:13,41,71` | vorhanden |
| Kosten erfassen, Profit-Übersicht, Kundenreport | `server/ai-influenza-profit-service.ts:6,30,56` | vorhanden |
| RBAC: Katalog öffentlich, Checkout/Portal für Kunden, Rest Admin | `server/ai-influenza-team-router.ts:27-94` | vorhanden |
| Mobiler Tab mit Paketen, Checkout, Portal, Kennzahlen | `app/(tabs)/ai-influenza-team.tsx` (143 Zeilen) | teilweise |
| Tests | 5 Dateien, 13 Tests, alle grün (`vitest run tests/ai-influenza-*`) | vorhanden |
| Release-Vorbereitung v2.8.0 | `.github/release-requests/2026-11-01-v2.8.0-ai-influenza-team.md`, `CHANGELOG.md` (Status: geplant) | offen |

Wiederverwendete Systeme statt Duplikate, wie im Phase-7-Plan festgelegt:
`b2b_network_nodes`/`edges` (CRM), `revenue_jobs` (Aufträge), `draftQueue`
(Content-Freigabe), `publishingJobs` (Veröffentlichung), `billingSubscriptions` +
Stripe-Webhooks (Zahlungswahrheit), `revenueAttributionEvents` /
`revenueCostEvents` (Umsatz und Kosten), vorhandenes LLM-Routing.

## 3. Lückenmatrix gegen den Master-Prompt

| Nr. | Anforderung | Ist | Lücke |
|---|---|---|---|
| 1 | Zehn Dashboard-Ansichten (Revenue, Agent Team, Lead Pipeline, Customer Management, Content Factory, Campaign Manager, Stripe & Subscriptions, Profit Analytics, Autopilot Control Center, System Health & QA) | Ein Screen mit Abschnitten | **9 von 10 Ansichten fehlen als eigene, navigierbare Ansicht.** Customer Management, Content Factory, Campaign Manager, Autopilot Control und System Health/QA haben keine Oberfläche. |
| 2 | Täglicher Umsatz-Autopilot | Drei Cron-Endpunkte existieren (`/api/cron/draft-engine`, `/api/cron/revenue-autopilot`, `/api/cron/control-center-autopilot`), `runControlCenterAutopilot` enthält aber **null** Influenza-Bezüge (`server/control-center-autopilot.ts`) | **nicht angebunden** |
| 3 | Kostenmessung pro Auftrag, automatisch aus Token-Verbrauch | Nur manuelles `recordCost` durch Admin | **manuell, nicht gemessen** |
| 4 | Testkunde vollständig durch den Auftragsprozess | `simulateAiInfluenzaTestJourney` ist deterministisch im Speicher, `tests/ai-influenza-e2e.test.ts` prüft Logik, nicht Persistenz | **kein echter Durchlauf gegen Datenbank/Stripe-Testmodus** |
| 5 | Content Factory und Video-Pipeline betriebsbereit | Verdrahtung auf `draftQueue`/`media-pipeline` vorhanden, aber kein Nachweis, dass ein Paket-Deliverable real erzeugt und freigegeben wird | **Verdrahtung unbelegt** |
| 6 | Kosten-/Budget-Grenzen im Autopilot (Token-Budget, Warteschlange bei Provider-Ausfall) | Modi und Freigabegates vorhanden, Budgetgrenzen nicht | **teilweise** |
| 7 | Health Checks, Circuit Breaker, Fallback für Influenza-Aufträge | Zentral im LLM-Routing vorhanden, keine auftragsbezogene Zuordnung | **teilweise** |
| 8 | Rechnungsverwaltung, Kündigung, Upgrade im Kundenfluss | Stripe-Portal verlinkt; Kündigung/Upgrade nur dort, kein CyberSarah-eigener Zustand | **teilweise, bewusst delegiert** |
| 9 | Rechtssicherheit der Kontaktaufnahme | Kontaktbasis-Feld und `externalActionAllowed:false`; kein dokumentierter Prozess für zulässige Ansprache | **Dokumentation fehlt** |
| 10 | Release v2.8.0 mit Nachweisen | Release-Request liegt, Status „geplant", kein Nachweis über Build/Deploy | **offen** |

## 4. Priorisierung (Auftrag: erst buchbar und lieferbar, dann skalieren)

**Stufe 1 — ein vollständig buchbares und lieferbares Angebot**

1. Echter Kundenweg gegen Persistenz: Checkout → Webhook → Abo → Auftrag →
   Liefer-Tasks → Draft → Freigabe → Lieferung → Report. Mit Stripe-Testmodus
   und einem klar als Test markierten Testkunden. Kein Live-Geld, keine
   erfundenen Ergebnisse.
2. Kostenmessung automatisch: Token-Verbrauch je Task erfassen und als
   `revenueCostEvents` mit Auftragsbezug buchen.
3. Content-Nachweis: ein Starter-Paket (12 Beiträge, 4 Bilder, Content-Plan)
   real erzeugen und freigeben, mit Beleg im Repo.

**Stufe 2 — Steuerung und Sichtbarkeit**

4. Die fehlenden Dashboard-Ansichten, beginnend mit Customer Management,
   Content Factory, Autopilot Control und System Health/QA.
5. Täglicher Autopilot als eigener Endpunkt plus Workflow, im Modus `assisted`,
   mit Budgetdeckel und Freigabegate für alles Externe.

**Stufe 3 — Absicherung und Release**

6. E2E-Suite gegen Datenbank, Sicherheitsprüfung der neuen Endpunkte,
   Release v2.8.0 mit belegten Builds.

## 5. Recht und Risiko (vor jeder Kontaktaufnahme zu klären)

- Kaltansprache von Unternehmen ist in Deutschland nur in engen Grenzen
  zulässig (§ 7 UWG). Automatisierte Werbemails an recherchierte Adressen sind
  es praktisch nie. Das System darf Leads recherchieren und Angebote
  vorbereiten, der Erstkontakt bleibt ein freigabepflichtiger, dokumentierter
  Schritt durch einen Menschen.
- DSGVO: Rechtsgrundlage und Löschfrist je Lead dokumentieren; öffentlich
  gefundene Kontaktdaten sind nicht automatisch verarbeitbar.
- Preisaussagen sind Hypothesen. Keine Umsatzgarantie, keine Erfolgsquote ohne
  Messdaten.
- Ein kostenloser Betrieb der KI-Kette ist nicht belegt: der Anbieter-Smoke-Test
  vom 01.11.2026 zeigte Groq 200, Gemini 503, OpenRouter 429. Kosten- und
  Limitaussagen nur mit Messung.

## 6. Nächster Schritt

Sprint 2 dieser Planung beginnt mit dem belegten Kundenweg und der
automatischen Kostenmessung, nicht mit neuen Oberflächen. Begründung: ohne
diesen Nachweis ist jede Ansicht Dekoration, und ohne Kostenmessung ist keine
Deckungsbeitragsrechnung möglich.

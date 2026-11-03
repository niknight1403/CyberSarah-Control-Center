# Sprint 229 — LLM-Quota-Abdeckungsprüfung

**Branch:** `fix/stripe-invoice-success-alias-20261103`  
**Stand:** 03.11.2026  
**Ziel:** Keine unbeabsichtigte Gratis-Cloud-Nutzung durch übersehene Aufrufstellen und keine falsche Belastung von Kundenkonten durch systemweite Hintergrundjobs.

## Ergebnis

Die Quota-Prüfung aus Sprint 228 deckt derzeit die verwalteten LLM-Aufrufe im Entwicklungschat ab. Eine globale Abdeckung aller `invokeLLM`-Aufrufstellen ist ausdrücklich nicht nachgewiesen. Ein pauschales Einbauen eines Nutzer-Gates in den globalen LLM-Router wäre fachlich falsch: Hintergrund- und Revenue-Jobs besitzen nicht automatisch einen authentifizierten Endnutzer, dem die Kosten belastet werden dürfen.

## Inventar der gefundenen Aufrufstellen

| Bereich / Datei | Einordnung | Nächste sichere Maßnahme |
|---|---|---|
| `server/development-chat.ts` — `callProvider` und `callProviderWithTools` | Managed-/Auto-Aufrufe sind mit Nutzer-ID, OpenID und Rolle an das Quota-Gate angebunden. | Reservierungsbasierte Parallelitätsgarantie ergänzen; direkte Provider-Keys bleiben getrennt. |
| `server/influencer-router.ts` | Interaktive Influencer-Generierung; Nutzerkontext ist im Router zu prüfen, bevor eine Belastung erfolgt. | Aufrufkontext und Abrechnungseigentümer explizit durchreichen und testen. |
| `server/draft-engine.ts`, `server/campaign-bridge.ts` | Draft-/Kampagnenpipeline; Aufträge können aus Automationen kommen. | Job-Eigentümer im Auftragsdatensatz persistieren; erst dann kundenbezogene Quota belasten. |
| `server/ai-influenza-delivery-service.ts` | Auftragsbezogene Hintergrund-Delivery; Task-Payload enthält eine Order-Referenz, aber der LLM-Aufruf selbst erhält keine authentifizierte Nutzeridentität. | Order-Eigentümer serverseitig auflösen und Kosten zunächst als Delivery-Kosten buchen; keine Zuordnung anhand frei übergebener IDs. |
| `server/publishing-service.ts`, `server/digistore24.ts` | Publishing-/Affiliate-Auftragsverarbeitung. | Auftragseigentümer und Kostenstelle aus persistiertem Job-Kontext ableiten; Retry-/Dedupe-Verhalten berücksichtigen. |
| `server/revenue-os-v2.ts`, `server/trend-revenue-bridge.ts` | Revenue- und Trend-Automation. | Betreiber-/Systemkostenstelle verwenden, nicht willkürlich ein Nutzerkonto belasten. |
| `server/orchestrator/superagent.ts`, `server/orchestrator/optimizer-loop.ts` | System-/Orchestrator-Aufgaben. | Eigenes Systembudget bzw. Admin-Kostenstelle und harte globale Provider-Limits definieren. |

Die Tabelle ist ein Aufrufstellen-Inventar, keine Behauptung, dass alle genannten Aufrufe Managed-Cloud-Provider nutzen oder in jedem Ausführungspfad aktiv sind. Der Provider und die tatsächliche Kostenart müssen zur Laufzeit getrennt betrachtet werden.

## Verbindliche Abrechnungsregeln

1. Kundenquota darf nur belastet werden, wenn der Server den Eigentümer aus einer authentifizierten Session oder einem vertrauenswürdigen, persistierten Auftrag aufgelöst hat.
2. Hintergrundjobs ohne eindeutig aufgelösten Auftragseigentümer werden einer Systemkostenstelle zugeordnet oder blockiert, falls ein globales Budget fehlt.
3. Vom Nutzer frei übergebene `userId`, `openId`, Order-IDs oder Metadaten sind keine Berechtigungsgrundlage.
4. Eigene Provider-Keys und lokale Provider dürfen nicht versehentlich als verwalteter Cloud-Pool abgerechnet werden.
5. Tatsächliche Provider-Usage hat Vorrang; Token-Schätzungen müssen als Schätzung gekennzeichnet bleiben.

## Noch offene technische Abnahme

- **Parallele Requests:** Sprint 228 macht die nachträgliche KV-Verbuchung atomar, aber Preflight und Verbrauchsbuchung sind getrennt. Ein Reservierungs-/Settlement-Ledger mit eindeutiger Request-ID ist noch nicht implementiert und getestet.
- **Interaktive Nebenmodule:** Die Influencer-, Draft-, Publishing- und Chat-Aufrufstellen müssen einzeln auf authentifizierten Kontext bzw. vertrauenswürdige Job-Eigentümer geprüft werden.
- **Systembudgets:** Revenue-, Optimizer- und Superagent-Jobs brauchen ein separates Betreiberbudget; eine pauschale Nutzerbelastung wäre nicht akzeptabel.

## Stripe-Review-Hinweis

Der Codex-Review-Kommentar zu Legacy-Invoice-Feldern bezog sich auf einen früher geprüften PR-Commit. Der aktuelle Branch enthält bereits `invoiceSubscriptionReference` und `invoiceSubscriptionMetadata` mit Fallbacks für `parent.subscription_details`, top-level `subscription_details` und top-level `subscription`. `tests/stripe-webhook-logic.test.ts` enthält dazu Regressionstests für moderne und Legacy-Payloads. Die Review-Feststellung ist damit auf dem aktuellen Branch durch Code und Test abgedeckt; sie darf nicht mit einer Live-Webhook-Abnahme verwechselt werden.

## Status

- Sprint-228 CI: erfolgreich auf Commit `e2d22337730b2685be37051d0e7fd94a2759fe35`.
- Gitleaks: erfolgreich auf demselben Commit.
- Externe Vercel-/Expo-Statuschecks bleiben Dashboard-/App-Integrationsprobleme und sind nicht durch Repository-Code allein reparierbar.
- Kein Merge, keine Live-Stripe-Zahlung und kein Produktionsdeploy durch diesen Audit.

# Sprint 228 — Stripe- und Monetarisierungs-Härtung

**Branch:** `fix/stripe-invoice-success-alias-20261103`  
**Ziel:** Erfolgreiche Stripe-Rechnungen konsistent synchronisieren und die bestehende Cloud-Quota-Implementierung tatsächlich an die verwalteten Chat-Aufrufe anbinden.

## Umgesetzte Arbeitspakete

1. **Stripe-Erfolgsereignisse:** `invoice.paid` und `invoice.payment_succeeded` laufen durch denselben idempotenten Abo-/Umsatz-Sync.
2. **Invoice-API-Kompatibilität:** Subscription-Referenzen werden aus modernen `parent.subscription_details`-Feldern und älteren Invoice-Feldern normalisiert.
3. **Umsatzzuordnung:** Subscription-Metadaten werden aus modernen und Legacy-Invoice-Payloads gelesen; Invoice-Metadaten sind ein Fallback.
4. **Produktkatalog:** Tests bilden das vorhandene vierte Elite-Paket und die Stripe-/Digistore-Kanäle ab.
5. **PostgreSQL-Testsetup:** Die freigegebene Content-Pipeline-Migration wird im Publishing-Gate vor dem Lifecycle-Test angewendet.
6. **Tier-Auflösung:** Nur konfigurierte Stripe-Preis-IDs erhalten Lite-/Pro-/Expert-Entitlements; unbekannte Preis-IDs fallen auf Free zurück.
7. **Fail-closed Billing-State:** Datenbankfehler bei Quota-/Abo-State werden nicht mehr stillschweigend als neues Free-Konto maskiert.
8. **Atomare KV-Schreibvorgänge:** Token- und Credit-Änderungen verwenden eine PostgreSQL-Transaktion mit Advisory Lock auf dem KV-Schlüssel.
9. **Quota-Abrechnung:** Monatsgrenzen werden bei der Verbrauchsverbuchung berücksichtigt; Admin-Usage verbraucht keine Credit-Packs.
10. **Managed-Chat-Gate:** Managed-LLM-Aufrufe im Entwicklungschat und Agent-Tool-Loop prüfen vor dem Aufruf das Kontingent und verbuchen danach Provider-Usage (falls geliefert), sonst eine gekennzeichnete Token-Schätzung. Enforcement ist Standard; `QUOTA_ENFORCEMENT=monitor` bleibt ein expliziter Diagnose-Override.

## Bereits vorhandene Betriebsüberwachung

- `.github/workflows/uptime-waechter.yml`: externer Produktiv-Healthcheck alle 30 Minuten, Issue-/Discord-Alarmierung und automatisches Schließen bei Erholung.
- `.github/workflows/keep-alive.yml`: /api/ready Ping alle 10 Minuten.
- Die produktive Architektur bleibt PM2/Render + Neon; kein paralleles Docker-Compose-Deployment wurde angelegt.

## Offene Abnahmegrenzen

- Das Quota-Gate ist in den beiden verwalteten Chat-Pfaden integriert. Andere direkte `invokeLLM`-Aufrufstellen außerhalb dieses Chats müssen separat inventarisiert und mit authentifiziertem Nutzerkontext verdrahtet werden, bevor globale Vollabdeckung behauptet werden kann.
- Preflight-Prüfung und spätere Usage-Verbuchung sind getrennte Operationen. Die KV-Verbuchung ist atomar, aber parallele Requests können zwischen Preflight und Abschluss noch dieselbe Restquota sehen. Für eine harte Parallel-Request-Garantie ist ein reservierungsbasiertes Ledger mit Freigabe/Abgleich erforderlich.
- CI, Vercel-Preview und verknüpfte Produktions-Builds müssen vor Merge grün sein.
- Kein Live-Stripe-Kauf und kein Produktionsdeployment wurden ausgeführt. Dafür sind verifizierte Live-Secrets und eine explizite Freigabe erforderlich.

## Verifikation

Regressionstests wurden ergänzt für Stripe-Event-Aliase, Invoice-Payload-Formate, Billing-Preis-Zuordnung, KV-Updates, Monatslimit-Abrechnung und Admin-Credit-Ausnahme. Der CI-Lauf für den aktuellen Branch muss diese Tests noch vollständig bestätigen.

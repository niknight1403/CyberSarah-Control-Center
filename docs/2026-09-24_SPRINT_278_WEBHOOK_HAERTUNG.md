# Sprint 278: Stripe-Webhook-Härtung (Kommunikation & Kosten-Risiko)

**Status: implementiert, getestet (24.09.2026)** — Teil des Monetarisierungs-Ziels.

## Was gehärtet wurde

1. **Fehler-Trennung statt Einheits-400:** `processStripeWebhook` unterscheidet jetzt
   `StripeWebhookSignatureError` (→ HTTP 400: Stripe kann dieses Event nie liefern)
   von `StripeWebhookProcessingError` (→ HTTP 500: Stripe stellt erneut zu).
   Vorher bekam auch ein transienter DB-/Stripe-Fehler eine 400-Antwort — suboptimal,
   weil Stripe dann zwar erneut zustellt, die Semantik aber loggte "ungültig".
2. **Best-Effort-Dedup:** bereits verarbeitete Event-IDs werden pro Instanz gemerkt
   (max. 500, FIFO-Verdrängung). Ehrlich dokumentiert: In-Memory, überlebt keinen
   Neustart, kennt Nachbar-Instanzen nicht. Die Verarbeitung selbst bleibt
   idempotent (Upserts) — Dedup spart nur nutzlose Doppelarbeit.
3. **Ops-Alerts bei umsatzkritischen Events:** `invoice.payment_failed` und
   `customer.subscription.deleted` lösen einen konfigurierbaren Alert aus
   (im Server an `sendOpsDiscordAlert` gebunden) — ehrlich formuliert, ohne Panik:
   payment_failed ist noch keine Kündigung.
4. **Signatur-Fehler schlagen nie durch:** Konstruktions-Fehler aus dem Stripe-SDK
   werden als Signatur-Fehler gekapselt, nicht als Verarbeitungs-Fehler.

## Tests (neu, 3)

- Ungültige Signatur → `StripeWebhookSignatureError`
- Duplikat-Event-ID → `duplicate: true`, keine Doppelverarbeitung
- `invoice.payment_failed` → Ops-Alert wird genau einmal gesendet

Test-Signaturen werden zur Laufzeit mit `whsec_gueltig` berechnet (echter
HMAC, kein Fake-Format, kein Secret im Code).

Gesamt: 1.542 Tests grün (181 Dateien), TypeScript/Lint/Build sauber.

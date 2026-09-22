# Webhook-Anleitung: Stripe & Digistore24

Diese Anleitung zeigt Schritt für Schritt, wie du die Webhook-Endpunkte in den
externen Dashboards registrierst, nachdem dein Server deployed und erreichbar ist.

---

## Voraussetzungen

- Dein Server läuft auf `https://DEINE-DOMAIN` (oder `http://IP:3000` zum Testen)
- Die `.env`-Datei enthält alle API-Keys
- Die Datenbank ist erreichbar (PostgreSQL)

---

## 1. Stripe Webhook registrieren

### Schritt 1: API-Keys aus dem Stripe Dashboard holen

1. Öffne **https://dashboard.stripe.com**
2. Navigiere zu **Developers → API keys**
3. Kopiere den **Secret key** (`sk_live_...` für Produktion oder `sk_test_...` zum Testen)
4. Trage ihn in die `.env`-Datei ein:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   ```

### Schritt 2: Webhook-Endpoint registrieren

1. Navigiere zu **Developers → Webhooks**
2. Klicke auf **"Add endpoint"**
3. Trage ein:
   - **Endpoint URL**: `https://DEINE-DOMAIN/api/stripe/webhook`
   - **Events to send**: Wähle mindestens aus:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `charge.refunded`
4. Klicke **"Add endpoint"**
5. Kopiere das **Signing secret** (`whsec_...`)
6. Trage es in die `.env`-Datei ein:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Schritt 3: Webhook testen

```bash
# Webhook-Signatur testen (lokal)
curl -X POST http://localhost:3000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: test" \
  -d '{"type":"test"}'

# Erwartet: 400 (ungültige Signatur = korrekt, wenn Secret gesetzt)
```

### Wichtig

- Die Webhook-URL muss von Stripe aus erreichbar sein (kein localhost!)
- Bei lokaler Entwicklung: nutze **Stripe CLI** zum Forwarden:
  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```

---

## 2. Digistore24 IPN registrieren

### Schritt 1: API-Key holen

1. Öffne **https://www.digistore24.com**
2. Logge dich ein (Vendor-Bereich)
3. Navigiere zu **Einstellungen → API**
4. Kopiere deinen **API-Key**
5. Trage ihn in die `.env`-Datei ein:
   ```
   DIGISTORE24_API_KEY=...
   ```

### Schritt 2: IPN-Webhook registrieren

1. Navigiere zu **Einstellungen → IPN (Instant Payment Notification)**
2. Trage die IPN-URL ein:
   - **IPN URL**: `https://DEINE-DOMAIN/api/digistore/ipn`
3. Aktiviere die IPN
4. Kopiere das **IPN Secret** (falls vorhanden)
5. Trage es in die `.env`-Datei ein:
   ```
   DIGISTORE24_IPN_SECRET=...
   ```

### Schritt 3: Affiliate-ID eintragen

Falls du Digistore24 als Affiliate nutzt:
1. Navigiere zu **Affiliate → Mein Profil**
2. Kopiere deine **Affiliate-ID**
3. Trage sie in die `.env`-Datei ein:
   ```
   DIGISTORE24_AFFILIATE_ID=...
   ```

### Schritt 4: Webhook testen

```bash
# IPN-Signatur testen (lokal)
curl -X POST http://localhost:3000/api/digistore/ipn \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "event=ipn_purchase&order_id=12345&product_id=1&product_name=Test&order_gross=4900&currency_code=EUR"

# Erwartet: 200 (wenn kein IPN_SECRET gesetzt) oder 401 (wenn Secret gesetzt)
```

---

## 3. Datenbank-Tabellen erstellen

Nach dem Deployen müssen die Tabellen in der Datenbank angelegt werden:

```bash
# Tabellen per Drizzle push erstellen
cd lib/db
DATABASE_URL="postgresql://..." pnpm run push

# Oder manuell via SQL:
# Die Tabellen werden beim ersten Serverstart automatisch erstellt,
# wenn du "drizzle-kit push" ausführst.
```

Erwartete Tabellen:
- `transactions` — Einnahmen, Verkäufe, Provisionen
- `webhook_events` — Audit-Log aller eingehenden Webhooks

---

## 4. Server starten und prüfen

```bash
# Server starten
bash start.sh

# Prüfen ob alles läuft
curl http://localhost:3000/healthz
# Erwartet: {"status":"ok"}

curl http://localhost:3000/api/system/status
# Erwartet: JSON mit Service-Status (hasStripe, hasOpenAI, etc.)

curl http://localhost:3000/api/webhook-events?limit=10
# Erwartet: [] (leere Liste, da noch keine Webhooks empfangen)
```

---

## 5. Dashboard-Ansicht

Die Webhook-Events sind im Dashboard unter folgender Route verfügbar:

```
GET /api/webhook-events?limit=50&quelle=stripe
GET /api/webhook-events?limit=50&quelle=digistore24
```

Die Antwort enthält:
- `id` — Eindeutige ID
- `quelle` — "stripe" oder "digistore24"
- `ereignisTyp` — z.B. "checkout.session.completed"
- `externId` — Stripe Event-ID oder DS24 Order-ID
- `signaturPruefung` — true/false ob Signatur geprüft wurde
- `signaturGueltig` — true/false ob Signatur gültig war
- `verarbeitet` — true/false ob Transaktion verbucht wurde
- `fehler` — Fehlermeldung bei Problemen
- `ipAdresse` — IP des Senders
- `createdAt` — Zeitstempel

---

## Fehlerbehebung

### Stripe Webhook bekommt 400 "Webhook-Verarbeitung fehlgeschlagen"

- Prüfe ob `STRIPE_WEBHOOK_SECRET` korrekt in `.env` eingetragen ist
- Stelle sicher, dass die Webhook-Route VOR `express.json()` registriert ist (ist bereits so)
- Teste mit `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### Digistore24 IPN bekommt 401 "Ungültige Signatur"

- Prüfe ob `DIGISTORE24_IPN_SECRET` korrekt in `.env` eingetragen ist
- Stelle sicher, dass Digistore24 das gleiche Secret verwendet
- Debug: Log-Level auf "debug" setzen und die Signatur-Vergleiche prüfen

### Keine Daten in der transactions-Tabelle

- Prüfe ob `DATABASE_URL` korrekt ist
- Prüfe ob die Tabellen existieren: `psql $DATABASE_URL -c "\dt"`
- Prüfe die Server-Logs auf DB-Fehler

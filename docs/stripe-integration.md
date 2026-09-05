# Stripe-Integration

## Server-Konfiguration

Der Backend-Service erwartet folgende Variablen in seiner `.env`-Datei:

```dotenv
STRIPE_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://app.cybersarah-ki.com
```

`STRIPE_MODE=live` akzeptiert ausschließlich `sk_live_`-Schlüssel. Für lokale Entwicklung wird ausdrücklich `STRIPE_MODE=test` mit einem `sk_test_`-Schlüssel verwendet. Secrets gehören ausschließlich in die Server-Umgebung und dürfen weder in das Repository noch in die mobile App gelangen.

## Endpunkte und Ablauf

Authentifizierte Nutzer rufen die tRPC-Mutation `billing.checkout` auf. Das Backend erstellt oder verwendet den Stripe-Kunden, legt eine abonnementbasierte Checkout-Session an und liefert ausschließlich deren HTTPS-URL an die App zurück. Die Account-Ansicht öffnet diese URL und zeigt anschließend den gespeicherten Abonnementstatus an.

Die Mutation `billing.portal` erzeugt eine Stripe-Billing-Portal-Session für bereits bekannte Kunden. Der öffentliche Webhook-Endpunkt lautet:

```text
POST /api/billing/stripe/webhook
```

Der Handler erhält den unveränderten JSON-Request-Body, prüft `stripe-signature` mit `STRIPE_WEBHOOK_SECRET` und synchronisiert `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` sowie `checkout.session.completed`. Die Datenbankoperationen sind über die eindeutige Stripe-Abonnement-ID wiederholbar.

## Lokaler Test mit Stripe CLI

Für einen lokalen Test werden Testschlüssel verwendet:

```bash
export STRIPE_MODE=test
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_PRICE_ID=price_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export APP_BASE_URL=https://localhost:3000
```

Danach wird der Webhook weitergeleitet:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/stripe/webhook
```

Das von `stripe listen` ausgegebene `whsec_...` muss als `STRIPE_WEBHOOK_SECRET` gesetzt werden. In einem zweiten Terminal kann ein Testereignis ausgelöst werden:

```bash
stripe trigger checkout.session.completed
```

Für eine realistische Abonnement-Synchronisierung sollte eine Test-Checkout-Session mit dem konfigurierten wiederkehrenden Testpreis abgeschlossen werden. Die Backend-Logs müssen eine erfolgreiche HTTP-200-Antwort des Webhooks zeigen.

## Server-Test

Nach dem Setzen der Live-Variablen und einem Neustart des Dienstes:

```bash
pm2 restart cybersarah-backend --update-env
pm2 logs cybersarah-backend --lines 100
```

In der Stripe-Dashboard-Konfiguration muss der Endpoint auf `https://app.cybersarah-ki.com/api/billing/stripe/webhook` zeigen und mindestens die oben genannten Subscription- und Checkout-Events abonnieren. Ein absichtlich ungültiger oder fehlender `stripe-signature`-Header muss mit HTTP 400 abgewiesen werden.

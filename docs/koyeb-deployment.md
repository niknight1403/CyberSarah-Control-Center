# Koyeb Deployment

Der produktive API-Dienst kann direkt aus dem GitHub-Repository als Docker-
Service auf Koyeb gestartet werden. Das Repository enthält dafür ein
Multi-Stage-`Dockerfile`; der Container bindet den von Koyeb gesetzten
`PORT`-Wert und stellt den Dienst auf Port `8000` bereit.

## Koyeb-Konfiguration

1. In Koyeb **Create Web Service** und als Quelle das Repository
   `niknight1403/CyberSarah-Control-Center` auswählen.
2. Als Branch `main` und als Builder **Dockerfile** verwenden.
3. Den Container-Port `8000` als öffentlichen HTTP-Port konfigurieren.
4. Den Health-Check auf `GET /api/health` setzen.
5. `NODE_ENV=production` setzen und die für die jeweilige Umgebung benötigten
   Secrets und Variablen hinterlegen, insbesondere Datenbank-, OAuth- und
   Stripe-Konfiguration.
6. Für die autonome Abo-Preiswahl `STRIPE_PRICE_LOOKUP_KEY` auf den stabilen
   Stripe-Lookup-Key des Monats-Preises setzen, zum Beispiel
   `cybersarah-monthly`. `STRIPE_PRICE_ID` bleibt optional; falls sie fehlt,
   wird der aktive wiederkehrende Preis über den Lookup-Key gewählt.
7. Für Mobile-Builds `EXPO_PUBLIC_API_BASE_URL` auf die öffentliche Koyeb-URL
   setzen, zum Beispiel `https://cybersarah-control-center-<id>.koyeb.app`.
   Die App verwendet diese URL anschließend für `/api/trpc` und OAuth.

Der Container verwendet automatisch `PORT`, falls Koyeb einen abweichenden
Port vorgibt. Für einen Datenbank-abhängigen Bereitschaftscheck steht zusätzlich
`GET /api/ready` zur Verfügung; dieser Endpoint liefert erst bei erreichbarer
Datenbank HTTP 200.

Der Build verwendet npm mit `package-lock.json` und führt im Docker-Build
`npm ci`, `npm run build` und anschließend `npm prune --omit=dev` aus.

Empfohlene Koyeb-Variablen:

```text
NODE_ENV=production
PORT=8000
APP_BASE_URL=https://<öffentliche-app-domain>
DATABASE_URL=<Koyeb-Secret>
JWT_SECRET=<Koyeb-Secret>
STRIPE_MODE=live
STRIPE_SECRET_KEY=<Koyeb-Secret>
STRIPE_PRICE_LOOKUP_KEY=cybersarah-monthly
STRIPE_WEBHOOK_SECRET=<Koyeb-Secret>
```

## Lokaler Smoke-Test

```bash
docker build -t cybersarah-control-center .
docker run --rm -p 8000:8000 cybersarah-control-center
curl http://localhost:8000/api/health
```

Erwartet wird eine JSON-Antwort mit `ok: true`.
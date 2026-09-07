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
APP_ALLOWED_ORIGINS=https://<öffentliche-app-domain>,https://app.cybersarah-ki.com,https://www.cybersarah-ki.com
DATABASE_URL=<Koyeb-Secret>
JWT_SECRET=<Koyeb-Secret>
STRIPE_MODE=live
STRIPE_SECRET_KEY=<Koyeb-Secret>
STRIPE_PRICE_LOOKUP_KEY=cybersarah-monthly
STRIPE_WEBHOOK_SECRET=<Koyeb-Secret>
```

Wichtige Hinweise zu den Variablen:

- **APP_ALLOWED_ORIGINS ist in Produktion Pflicht.** Ohne sie lehnt die
  Sicherheits-Middleware jeden Browser-Request mit Origin-Header mit
  HTTP 403 ab (bei NODE_ENV=production gibt es keinen Fallback). Es müssen
  alle Domains eingetragen sein, von denen die Web-App den API-Dienst
  aufruft – inklusive der Koyeb-URL.
- **JWT_SECRET wird für die Session-Cookies benötigt.** Ohne ihn ist kein
  Login möglich. Auch OAUTH_SERVER_URL und OWNER_OPEN_ID müssen wie auf
  dem VPS übernommen werden, wenn Login/Owner-Funktionen genutzt werden.
- **METRICS_TOKEN ist optional** und schützt `/api/metrics`; ohne ihn
  bleibt der Endpoint gesperrt.

## Datenbank

Der Container erreicht nur Datenbanken, die öffentlich (oder innerhalb
Koyeb) erreichbar sind. Die produktive MariaDB auf dem VPS lauscht auf
127.0.0.1:3306 und ist von Koyeb aus NICHT erreichbar – eine
DATABASE_URL mit localhost funktioniert dort nicht. Optionen:

1. Von Koyeb bereitgestellte Datenbank (Service/Instance im selben Koyeb-
   Workspace) und DATABASE_URL auf deren Endpunkt setzen.
2. Die VPS-MariaDB NICHT öffentlich exponieren; sie bleibt der Produktions-
   datenbestand für den nginx/PM2-Betrieb.

Vor dem ersten Start müssen die Drizzle-Migrationen (drizzle/*.sql) gegen
die gewählte Koyeb-Datenbank eingespielt werden, da der Container selbst
keine Migrationen ausführt – identisch zum VPS-Workflow.

## Lokaler Smoke-Test

```bash
docker build -t cybersarah-control-center .
docker run --rm -p 8000:8000 cybersarah-control-center
curl http://localhost:8000/api/health
```

Erwartet wird eine JSON-Antwort mit `ok: true`.
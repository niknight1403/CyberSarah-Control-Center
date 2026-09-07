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

Der Container verwendet automatisch `PORT`, falls Koyeb einen abweichenden
Port vorgibt. Für einen Datenbank-abhängigen Bereitschaftscheck steht zusätzlich
`GET /api/ready` zur Verfügung; dieser Endpoint liefert erst bei erreichbarer
Datenbank HTTP 200.

## Lokaler Smoke-Test

```bash
docker build -t cybersarah-control-center .
docker run --rm -p 8000:8000 cybersarah-control-center
curl http://localhost:8000/api/health
```

Erwartet wird eine JSON-Antwort mit `ok: true`. Der Docker-Build führt bereits
`pnpm install --frozen-lockfile`, `pnpm build` und das anschließende Entfernen
der Dev-Abhängigkeiten aus.
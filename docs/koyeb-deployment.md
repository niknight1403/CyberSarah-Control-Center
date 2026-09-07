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
Koyeb) erreichbar sind. Eine DATABASE_URL mit localhost funktioniert dort nicht. Der Hetzner-Exit
ist vollzogen (siehe docs/HETZNER-EXIT.md): Der Server nutzt PostgreSQL
(drizzle-orm/node-postgres), produktive Datenbank ist ein Koyeb-Database-
Service (verwaltetes PostgreSQL). Dessen Endpunkt wird als DATABASE_URL-
Secret hinterlegt; der Datenumzug von der ehemaligen VPS-MariaDB ist im
Exit-Runbook beschrieben.

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
## Automatisiertes Deployment (scripts/koyeb-deploy.mjs)

Das Deployment ist als Ein-Befehl-Skript automatisiert. Der Koyeb-API-Token
wird ausschließlich aus der Umgebung (`KOYEB_TOKEN`) gelesen und niemals ins
Repository committet.

```bash
# Dry-Run: Request-Body pruefen, ohne Ressourcen anzulegen
KOYEB_TOKEN=<token> DATABASE_URL=<koyeb-postgres-uri> \
  node scripts/koyeb-deploy.mjs --dry-run

# Vollständiges Deployment inkl. Migrationen und Health-Verifikation
KOYEB_TOKEN=<token> DATABASE_URL=<koyeb-postgres-uri> \
  JWT_SECRET=<secret> METRICS_TOKEN=<secret> \
  node scripts/koyeb-deploy.mjs --migrate
```

Ablauf des Skripts:

1. Token-Format validieren (lib/koyeb-deploy-logic.mjs, 16 deterministische
   Tests; Fließtext statt Token wird abgelehnt).
2. Optional `--migrate`: Drizzle-Migrationen gegen die Koyeb-Datenbank.
3. App mit API+Web-Kombidienst anlegen (POST /v1/apps, Docker-Builder,
   Port 8000, Health-Check /api/health, Region fra).
4. Auf Healthy warten und die öffentliche URL ermitteln.
5. ENV mit der echten Domain patchen (APP_BASE_URL, APP_ALLOWED_ORIGINS)
   und auf den Redeploy warten.
6. `/api/health` öffentlich verifizieren.

Voraussetzungen: Das Koyeb-GitHub-App muss Zugriff auf das Repository
haben (Koyeb-Konsole → Integrations → GitHub installieren). Die
Datenbank (Koyeb-Database-Service PostgreSQL) muss existieren und als
DATABASE_URL erreichbar sein. Weitere ENVs (STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET) werden optional aus der Umgebung übernommen.

## Secrets-Architektur (wo welche Werte leben)

Damit nach dem Klonen des Repositories nichts manuell nachgetragen werden
muss, leben die Secrets an drei klar getrennten Orten — niemals im
Repository selbst (Schutz vor Leaks, GitHub-Scanning, Zugriffskontrolle):

1. **GitHub Actions Secrets** (Repo → Settings → Secrets and variables →
   Actions): Für alle CI-/Build- und Bootstrap-Läufe. Nach jedem Laden
   des Repos sind sie in jedem Workflow-Run automatisch integriert
   (Write-only: GitHub gibt sie nie wieder heraus, nur in Workflows
   ein). Der Workflow `.github/workflows/koyeb-bootstrap.yml` zieht
   KOYEB_TOKEN, DATABASE_URL, JWT_SECRET, METRICS_TOKEN und die
   Stripe-Keys ausschließlich aus diesem Speicher.
2. **Koyeb-ENV-Konfiguration** (Koyeb-Konsole → Service → Environment):
   Für den Laufzeitbetrieb. Werden von `scripts/koyeb-deploy.mjs`
   automatisch beim Anlegen des Dienstes gesetzt und beim Redeploy mit
   der echten Domain gepatcht (APP_BASE_URL, APP_ALLOWED_ORIGINS).
3. **Lokale Entwicklung**: `.env.example` dokumentiert alle Variablen,
   die lokale `.env` bleibt gitignored und wird nie committet.

Fehlende Werte werden nicht geraten: KOYEB_TOKEN muss als
Actions-Secret existieren (Koyeb-Konsole → Account Settings → API), die
Koyeb-PostgreSQL-DATABASE_URL entsteht bei Anlage der Datenbank.

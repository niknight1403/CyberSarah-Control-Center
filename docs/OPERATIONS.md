# CyberSarah Control Center — Betriebshandbuch

## Lokale Entwicklung

```bash
npm ci
npm run dev
```

Der Produktions-Bundle wird mit `npm run build` erzeugt und mit `npm start` gestartet. Secrets gehören ausschließlich in eine lokale `.env` oder in die Secret-Verwaltung des jeweiligen Hosts.

## Produktion: Render + Neon (einziger Betriebspfad)

Die Produktion läuft vollständig auf Render (Free Plan) mit Neon-PostgreSQL
als Datenbank. Der API-Dienst (inklusive statischem Web-Export) und der
Custom-AI-Studio-Workspace-Service laufen als eigene Render-Dienste aus
dem Repository (`Dockerfile` bzw. `workspace-service/Dockerfile` mit
`rootDir`, siehe `docs/render-deployment.md` und `render.yaml`). Die
PostgreSQL-Datenbank ist ein Neon-Free-Project — Render Free Postgres
wird nach 30 Tagen gelöscht und ist deshalb bewusst nicht im Einsatz.
Der vollständige Umzugs- und Abschaltplan liegt in `docs/HETZNER-EXIT.md`.
Deploy und Laufzeit-ENV übernimmt der GitHub-Actions-Workflow „Render
Deploy" vollautomatisch aus den Actions-Secrets; vor jedem Deploy prüft
`scripts/validate-production.mjs` die ENV lokal.

## Backup und Wiederherstellung

Verschlüsselte Settings-Backups enthalten nur Provider-Konfigurationen und lokale Endpoints. Service- und GitHub-Tokens sowie Chat-Inhalte sind ausgeschlossen. Vor einem Restore wird die Authentizität geprüft und eine Vorschau angezeigt. Server-Archive werden vor Löschungen lokal übertragen und per SHA-256 gegen die Quelle verifiziert.

## Android-Publish-Handoff

Die Android-Konfiguration ist portrait-orientiert und verwendet das CyberSarah-Control-Center-Branding. Der APK-Build wird über die verwaltete Publish-Oberfläche gestartet. Nach dem Download ist ein Test auf einem echten Android-Gerät erforderlich; insbesondere Login, Workspace-Service, SecureStore, Medienauswahl, lokale Provider-Endpoints und Push-Berechtigungen sind zu prüfen.

## Server-Umgebung (ENV-Checkliste)

`scripts/validate-production.mjs` prüft die Produktionsumgebung vor jedem Deploy. Die Variablennamen müssen exakt stimmen – der Server liest ausschließlich die folgenden Namen:

| Variable | Bedeutung | Hinweis |
|---|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung (`postgresql://…`) | Der Server nutzt `drizzle-orm/node-postgres` gegen Neon-PostgreSQL; MySQL-URLs werden abgewiesen |
| `APP_ALLOWED_ORIGINS` | Erlaubte Web-Origins (kommagetrennt) | Ohne diese Variable blockiert der Server produktive Web-Requests mit HTTP 403; `ALLOWED_ORIGINS` ist ein bekannter Tippfehler |
| `APP_BASE_URL` | HTTPS-Basis-URL | Muss mit `https://` beginnen |
| `JWT_SECRET` | Sitzungs-Signatur | Mindestens 32 Zeichen |
| `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Live-/Test-Billing | `sk_live_`/`sk_test_`, `price_`, `whsec_`-Präfixe werden geprüft |
| `BUILT_IN_FORGE_API_KEY` oder `OPENAI_API_KEY`/`AI_*_API_KEY` | KI-Provider | Mindestens ein Provider, damit der Entwicklungsauftrag antwortet; lokale Endpoints über `AI_OLLAMA_BASE_URL`, `AI_LMSTUDIO_BASE_URL` oder `AI_CUSTOM_BASE_URL`; optionale `AI_FALLBACK_PROVIDERS` erhöhen die Ausfallsicherheit |

## Monitoring-Endpunkte

`GET /api/health` prüft die Prozess-Erreichbarkeit. `GET /api/ready` führt zusätzlich einen echten PostgreSQL-Readiness-Check mit `SELECT 1` aus und antwortet bei nicht erreichbarer Datenbank mit HTTP 503. Prometheus-kompatible Prozessmetriken sind unter `GET /api/metrics` verfügbar; in Produktion ist dafür `Authorization: Bearer $METRICS_TOKEN` erforderlich.

## Sicherheitsregeln

Zugangsdaten, Topic-URLs, API-Keys, private SSH-Schlüssel und vollständige Tokens dürfen nicht in Git, Issues, CI-Ausgaben oder Chat-Nachrichten erscheinen. Bei versehentlich offengelegten Werten ist der betreffende Secret sofort zu widerrufen und neu zu erzeugen.

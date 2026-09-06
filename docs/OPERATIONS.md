# CyberSarah Control Center — Betriebshandbuch

## Lokale Entwicklung

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Der Produktions-Bundle wird mit `pnpm build` erzeugt und mit `pnpm start` gestartet. Secrets gehören ausschließlich in eine lokale `.env` oder in die Secret-Verwaltung des jeweiligen Hosts.

## Render

Render verwendet `render.yaml`. Der Build lautet `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build`, der Start erfolgt mit `pnpm start`. `OAUTH_SERVER_URL` und `EXPO_PUBLIC_OAUTH_SERVER_URL` werden ausschließlich als geschützte Render-Environment-Variablen hinterlegt.

## Hetzner und systemd

Der Produktionsstand liegt unter `/opt/cybersarah-control-center`. Eine Service-Unit muss mit einem unprivilegierten, auf dem Host tatsächlich vorhandenen Benutzer betrieben werden. Status und Logs werden mit `systemctl status cybersarah.service --no-pager` und `journalctl -u cybersarah.service -f` geprüft.

## Speicherüberwachung

Das Skript `deploy/cybersarah-disk-check-ntfy.sh` prüft das Root-Dateisystem, verwendet konfigurierbare Warnschwellen und sendet nur bei Statuswechseln an ntfy. Die Topic-URL liegt in `/etc/cybersarah/disk-alert.env` mit Modus `0600`; sie wird weder in Git noch in Logs ausgegeben. Der zugehörige Timer sollte mit `systemctl list-timers cybersarah-disk-check-ntfy.timer --no-pager` geprüft werden.

## Backup und Wiederherstellung

Verschlüsselte Settings-Backups enthalten nur Provider-Konfigurationen und lokale Endpoints. Service- und GitHub-Tokens sowie Chat-Inhalte sind ausgeschlossen. Vor einem Restore wird die Authentizität geprüft und eine Vorschau angezeigt. Server-Archive werden vor Löschungen lokal übertragen und per SHA-256 gegen die Quelle verifiziert.

## Android-Publish-Handoff

Die Android-Konfiguration ist portrait-orientiert und verwendet das CyberSarah-Control-Center-Branding. Der APK-Build wird über die verwaltete Publish-Oberfläche gestartet. Nach dem Download ist ein Test auf einem echten Android-Gerät erforderlich; insbesondere Login, Workspace-Service, SecureStore, Medienauswahl, lokale Provider-Endpoints und Push-Berechtigungen sind zu prüfen.

## Server-Umgebung (ENV-Checkliste)

`scripts/validate-production.mjs` prüft die Produktionsumgebung vor jedem Deploy. Die Variablennamen müssen exakt stimmen – der Server liest ausschließlich die folgenden Namen:

| Variable | Bedeutung | Hinweis |
|---|---|---|
| `DATABASE_URL` | MySQL-Verbindung (`mysql://…`) | Der Server nutzt `drizzle-orm/mysql2`; `postgressl://`- und `postgresql://`-URLs sowie der Tippfehler `DATARASE_URL` werden abgewiesen |
| `APP_ALLOWED_ORIGINS` | Erlaubte Web-Origins (kommagetrennt) | Ohne diese Variable blockiert der Server produktive Web-Requests mit HTTP 403; `ALLOWED_ORIGINS` ist ein bekannter Tippfehler |
| `APP_BASE_URL` | HTTPS-Basis-URL | Muss mit `https://` beginnen |
| `JWT_SECRET` | Sitzungs-Signatur | Mindestens 32 Zeichen |
| `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Live-/Test-Billing | `sk_live_`/`sk_test_`, `price_`, `whsec_`-Präfixe werden geprüft |
| `BUILT_IN_FORGE_API_KEY` oder `OPENAI_API_KEY`/`AI_*_API_KEY` | KI-Provider | Mindestens ein Provider, damit der Entwicklungsauftrag antwortet; lokale Endpoints über `AI_OLLAMA_BASE_URL`, `AI_LMSTUDIO_BASE_URL` oder `AI_CUSTOM_BASE_URL`; optionale `AI_FALLBACK_PROVIDERS` erhöhen die Ausfallsicherheit |

## Monitoring-Endpunkte

`GET /api/health` prüft die Prozess-Erreichbarkeit. `GET /api/ready` führt zusätzlich einen echten MySQL-Readiness-Check mit `SELECT 1` aus und antwortet bei nicht erreichbarer Datenbank mit HTTP 503. Prometheus-kompatible Prozessmetriken sind unter `GET /api/metrics` verfügbar; in Produktion ist dafür `Authorization: Bearer $METRICS_TOKEN` erforderlich.

## Sicherheitsregeln

Zugangsdaten, Topic-URLs, API-Keys, private SSH-Schlüssel und vollständige Tokens dürfen nicht in Git, Issues, CI-Ausgaben oder Chat-Nachrichten erscheinen. Bei versehentlich offengelegten Werten ist der betreffende Secret sofort zu widerrufen und neu zu erzeugen.

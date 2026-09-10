# Render-Deployment (Koyeb-Ersatz)

**Stand:** Sprint 54 (2026-09-10) · Koyeb wurde vollständig aus dem Repository entfernt. Betriebspfad ist jetzt: **Render Free** (API+Web und Workspace-Service) + **Neon Free** (PostgreSQL).

## Warum Render + Neon (100 % kostenfrei)

| Anforderung | Lösung | Begründung |
|---|---|---|
| Express/tRPC-API + statischer Web-Export (Docker) | Render Free Web Service | Docker-Runtime unterstützt, 750 Instanz-Stunden/Monat, keine Zahlungsdaten nötig, Schlaf nach 15 Min. Inaktivität (Aufwach-Verzug ~50 s) |
| PostgreSQL | **Neon Free** | Render Free Postgres wird **nach 30 Tagen gelöscht** — ungeeignet für Produktion. Neon Free: 512 MB, autosuspend, Connection-String `postgresql://…neon.tech/…` |
| Workspace-Service (Port 8787, token-geschützt) | Render Free Web Service | `rootDir: workspace-service`, original-Dockerfile mit lokalen COPY-Pfaden |
| Cron/Scheduling | — | Render Cron Jobs sind kostenpflichtig ($1/Monat je Job); es gibt aktuell keinen app-seitigen Cron-Bedarf |
| Persistent Volume für WORKSPACES_DIR | — | Render Persistent Disks sind bezahlt; Free-Betrieb nutzt ephemere Disk (Verlust bei jedem Deploy/Neustart). Upgrade-Pfad dokumentiert. |

Zwei Free-Dienste teilen sich die **750 Instanz-Stunden pro Monat** — bei überwiegend idle Last (Schlaf nach 15 Min.) passt das; Dauerlauf zweier Dienste 24/7 würde es nicht.

## Automatischer Deploy (primärer Pffad)

GitHub Actions Workflow **„Render Deploy"** (`.github/workflows/render-deploy.yml`, `workflow_dispatch`):

1. Check-out, `npm ci`, TypeCheck + Tests
2. `node scripts/render-deploy.mjs --migrate` (App) bzw. `--workspace`
3. Skript: API-Key- und DATABASE_URL-Validierung → Drizzle-Migrationen → idempotenter Service-Upsert (neu anlegen **oder** ENV komplett ersetzen) → auf Live-Deploy warten → `/api/health` bzw. `/api/v1/health` öffentlich verifizieren

Das Skript ist **idempotent**: Wiederholtes Ausführen aktualisiert ENV und triggert einen Re-Deploy statt Dubletten anzulegen. Secrets werden in allen Logs maskiert (`lib/render-deploy-logic.mjs`).

### Erforderliche GitHub-Actions-Secrets

| Secret | Status | Beschreibung |
|---|---|---|
| `RENDER_API_KEY` | **neu — Owner-Schritt** | Render Dashboard → Account Settings → API Keys (`rnd_…`) |
| `DATABASE_URL` | **aktualisieren — Owner-Schritt** | Neon-Connection-String (alter Wert war Koyeb-Postgres) |
| `SERVICE_ACCESS_TOKEN` | vorhanden (automatisch gesetzt) | Token zwischen App-Server und Workspace-Service |
| `JWT_SECRET`, `METRICS_TOKEN` | vorhanden | Session-Signatur, `/api/metrics`-Schutz |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `OPENAI_API_KEY` | vorhanden | Laufzeit-ENV des App-Dienstes |

`ADMIN_EMAIL`, `STRIPE_PRICE_ID`, `TRUST_PROXY` sind optional (Defaults: `TRUST_PROXY=1`, Stripe-Preis-Auflösung über Lookup-Key `cybersarah-monthly`).

## Erforderliche Render-/Neon-ENV (Laufzeit)

Pflicht (Deploy verweigert Start bzw. ersten Request):

- `NODE_ENV=production`
- `DATABASE_URL` — Neon-PostgreSQL (Fail-Fast-Validierung in `scripts/validate-production.mjs` und Deploy-Skript: nur `postgresql://`, kein localhost)
- `APP_BASE_URL` — öffentliche Service-URL
- `APP_ALLOWED_ORIGINS` — **Pflicht**: ohne sie blockiert die Security-Middleware produktive Web-Requests mit 403
- `JWT_SECRET` — Session-Signatur
- (Workspace-Service) `SERVICE_ACCESS_TOKEN` — Produktion verweigert ohne Token den Start

Optional mit sinnvollen Defaults: `METRICS_TOKEN`, `OPENAI_API_KEY` (Managed-LLM-Fallback, Sprint 53), Stripe-ENV, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `ADMIN_EMAIL`, `TRUST_PROXY=1`.

## Initiale Inbetriebnahme (einmalig, Owner)

1. **Render-Account** (kostenlos, ohne Zahlungsdaten) → Account Settings → **API Key** erstellen (`rnd_…`) → als GitHub-Actions-Secret `RENDER_API_KEY` hinterlegen.
2. **Neon-Account** (kostenlos) → Project anlegen → Connection-String kopieren → GitHub-Actions-Secret `DATABASE_URL` **ersetzen**.
3. GitHub UI → Actions → **„Render Deploy"** → Run workflow (`target: app`) — legt den Dienst an, migriert die DB, verifiziert Health.
4. Optional: Run workflow (`target: `workspace`) — Workspace-Service mit `SERVICE_ACCESS_TOKEN`.
5. Custom Domain: Render Dashboard → Service → Settings → Custom Domain `app.cybersarah-ki.com` (DNS-Cutover, Phase 5 des Hetzner-Exits).

**Voraussetzung:** Render muss einmalig Zugriff auf das (private) GitHub-Repository haben — beim ersten API-Anlegevorgang verlinkt Render über den GitHub-Account des Owners (OAuth) bzw. das Dashboard fordert die Repository-Freigabe. Render braucht dazu keine Secrets aus dem Repo.

## Ephemeral Storage (WORKSPACES_DIR)

Render Free hat **keine persistenten Disks** — der Storage ist ephemeral (flüchtig). Der Workspace-Service fällt ohne `WORKSPACES_DIR` auf ein beschreibbares lokales Verzeichnis zurück und warnt beim Start über Ephemeralität: Workspace-Repositorys liegen dann im Arbeitsspeicher/Dateisystem des Containers und verschwinden beim Re-Deploy. Da der Service die Repos per `git clone` aus Remote-Quellen bezieht, ist das für Preview-Zwecke funktional; langlebige Workspaces erfordern eine Render Persistent Disk (bezahlter Owner-Schritt, Upgrade-Pfad bleibt dokumentiert).

## Secrets-Architektur (unverändert)

- **GitHub Actions Secrets** (write-only) — Quelle aller Deploy-Werte; der Workflow reicht sie als ENV an das Skript.
- **Render-ENV** — Laufzeit-ENV der Dienste; wird vom Deploy-Skript vollautomatisch aus den Actions-Secrets gesetzt (kein manuelles Dashboard-Pflegen).
- **Lokale `.env`** — gitignored, nur Sandbox.
- Keine Secrets im Repository (CI-Test verankert das; Scan-Schutz in `tests/deployment-config.test.ts`).

## Debugging

- Deploy-Logs: Render Dashboard → Service → Events/Logs; API: `GET /v1/services/{id}/deploys`
- `/api/health` (200) und `/api/ready` (Datenbank-Check) öffentlich; `/api/metrics` mit `METRICS_TOKEN`
- Skript-Fehler sind übersetzt (`renderApiError`): 401 → Key ungueltig, 429 → Rate-Limit, Build-Fail → Render-Logs pruefen

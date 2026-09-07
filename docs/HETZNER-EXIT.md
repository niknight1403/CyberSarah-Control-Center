# Hetzner-Exit — Kompletter Umzug auf Koyeb

Beschluss (2026-09-07): Hetzner verschwindet vollständig aus dem Projekt.
**Alles läuft auf Koyeb** — API, Web-App, Workspace-Service und Datenbank.

## Zielbild

| Baustein | Koyeb-Dienst | Quelle |
| --- | --- | --- |
| API-Server | Web Service (Docker) | `Dockerfile`, siehe `docs/koyeb-deployment.md` |
| Web-App (Expo Static Export) | Static Site / Web Service | `expo export --platform web` |
| Custom-AI-Studio Workspace-Service | Web Service (Docker) | `workspace-service/Dockerfile` |
| Datenbank | Koyeb Database Service (PostgreSQL, verwaltet) | Koyeb-Konsole |

Der Workspace-Service ist Koyeb-tauglich: Der Vite-Preview läuft als
pfadbasierter Proxy (`/preview/:workspaceId/`) über denselben Port,
einschließlich WebSocket-Upgrades. Hinweis: Koyeb-Container-Dateisysteme
sind nach Redeploy neu — geklonte Repos werden bei Bedarf neu von GitHub
geladen (funktionale Einschränkung: kein persistenter Workspace-Cache).

## Phase 1 — Repo-Bereinigung (abgeschlossen)

Alle Hetzner/VPS-Betriebsartefakte sind entfernt: systemd-Units und
Monitoring (`deploy/`), PM2 (`ecosystem.config.cjs`), Deploy- und
Uptime-Skripte. Koyeb ist im Betriebshandbuch der einzige Betriebspfad.
**Wichtig:** Der laufende VPS darf ab diesem Commit kein `git pull` mehr
ausführen — der Repository-Deploy-Pfad des VPS ist bewusst eingefroren.
Der VPS läuft unangetastet weiter, bis der Cutover (Phase 5) abgeschlossen
ist.

## Phase 2 — PostgreSQL-Sprint (als Nächstes)

Koyeb-Datenbanken sind verwaltetes PostgreSQL; MySQL bietet Koyeb nicht.
Der Server wird daher von `drizzle-orm/mysql2` auf PostgreSQL
(`drizzle-orm/node-postgres`) umgestellt: Schema-Dialekt, Migrationen,
`validate-production.mjs` (akzeptiert künftig `postgresql://…`) und
deterministische Tests.

## Phase 3 — Datenmigration

1. `mysqldump` der Produktiv-DB `cybersarah` (users, billingSubscriptions)
   auf dem VPS (manuelles Handoff-Kommando).
2. Konvertierung nach PostgreSQL und Import in den Koyeb-Database-Service
   (Agent übernimmt Konvertierung und Import-SQL gegen den Koyeb-Endpoint).
3. Gegenprüfung: Datensatzzahlen pro Tabelle identisch.

## Phase 4 — Koyeb-Dienste

1. API-Dienst aus dem GitHub-Repository bauen (Branch `main`, Dockerfile),
   alle Secrets als Koyeb-Umgebungsvariablen (Liste in
   `docs/koyeb-deployment.md`), inklusive `APP_ALLOWED_ORIGINS`.
2. Workspace-Service als eigenen Dienst anlegen
   (`SERVICE_ACCESS_TOKEN`, `PREVIEW_PUBLIC_BASE_URL` auf die öffentliche
   HTTPS-Origin des Dienstes setzen, WebSockets müssen erlaubt sein).
3. Web-App als statischen Dienst bereitstellen; `APP_ALLOWED_ORIGINS`
   der API um die Web-Origin ergänzen.

## Phase 5 — DNS-Cutover

1. `app.cybersarah-ki.com` als Custom Domain auf den Koyeb-API-Dienst
   zeigen lassen (CNAME/ALIAS).
2. Smoke-Test: `/api/health` 200, `/api/ready` 200 (database: true),
   Login, Checkout-Session, Workspace-Attach.
3. Mobile `EXPO_PUBLIC_API_BASE_URL` auf die neue Origin umstellen.

## Phase 6 — VPS-Dekommission

1. Finale Datensicherung (Archiv + SHA-256), dann Platte löschen
   (`secure_erase` oder Neuinstallation mit Löschung).
2. Hetzner-Vertrag kündigen.
3. DNS-Alt-Einträge auf die Hetzner-IP entfernen.

## Ausstehende Entscheidungen

Keine — Zielplattform (Koyeb) und Umfang (alles) sind beschlossen.

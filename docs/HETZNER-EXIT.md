# Hetzner-Exit — Kompletter Umzug auf Render + Neon

Beschluss (2026-09-07): Hetzner verschwindet vollständig aus dem Projekt.
**Alles läuft auf Render (Free) + Neon (Free)** — API, Web-App, Workspace-Service und Datenbank. (Koyeb wurde in Sprint 54 vollständig ersetzt.)

## Zielbild

| Baustein | Render-Dienst | Quelle |
| --- | --- | --- |
| API-Server | Web Service (Docker) | `Dockerfile`, siehe `docs/render-deployment.md` und `render.yaml` |
| Web-App (Expo Static Export) | Static Site / Web Service | `expo export --platform web` |
| Custom-AI-Studio Workspace-Service | Web Service (Docker) | `workspace-service/Dockerfile` |
| Datenbank | Neon Free PostgreSQL (verwaltet) | Neon-Console, `DATABASE_URL` |

Der Workspace-Service ist Render-tauglich: Der Vite-Preview läuft als
pfadbasierter Proxy (`/preview/:workspaceId/`) über denselben Port,
einschließlich WebSocket-Upgrades. Hinweis: Render-Container-Dateisysteme
sind nach Redeploy neu — geklonte Repos werden bei Bedarf neu von GitHub
geladen (funktionale Einschränkung: kein persistenter Workspace-Cache).

## Phase 1 — Repo-Bereinigung (abgeschlossen)

Alle Hetzner/VPS-Betriebsartefakte sind entfernt: systemd-Units und
Monitoring (`deploy/`), PM2 (`ecosystem.config.cjs`), Deploy- und
Uptime-Skripte. Render+Neon ist im Betriebshandbuch der einzige Betriebspfad.
**Wichtig:** Der laufende VPS darf ab diesem Commit kein `git pull` mehr
ausführen — der Repository-Deploy-Pfad des VPS ist bewusst eingefroren.
Der VPS läuft unangetastet weiter, bis der Cutover (Phase 5) abgeschlossen
ist.

## Phase 2 — PostgreSQL-Sprint (abgeschlossen)

Neon liefert verwaltetes PostgreSQL; der Server nutzt drizzle-orm/node-postgres.
Der Server wurde auf `drizzle-orm/node-postgres` umgestellt: Schema
(`drizzle/schema.ts`, pg-core mit `user_role`-Enum), frische PG-Migration
(`drizzle/0000_dapper_husk.sql`), Upserts via `onConflictDoUpdate`,
`validate-production.mjs` akzeptiert nur noch `postgresql://…` und prüft
die Verbindung mit `pg`. `mysql2` ist aus den Abhängigkeiten entfernt.

## Phase 3 — Datenmigration

1. `mysqldump` der Produktiv-DB `cybersarah` (users, billingSubscriptions)
   auf dem VPS (manuelles Handoff-Kommando).
2. Konvertierung nach PostgreSQL und Import in die Neon-Datenbank
   (Agent übernimmt Konvertierung und Import-SQL gegen den Neon-Endpoint).
3. Gegenprüfung: Datensatzzahlen pro Tabelle identisch.

## Phase 4 — Render-Dienste

1. API-Dienst aus dem GitHub-Repository bauen (Branch `main`, Dockerfile),
   alle Secrets als Render-Umgebungsvariablen — vollautomatisch über den
   GitHub-Actions-Workflow „Render Deploy" aus den Actions-Secrets (Liste in
   `docs/render-deployment.md`), inklusive `APP_ALLOWED_ORIGINS`.
2. Workspace-Service als eigenen Dienst anlegen
   (`SERVICE_ACCESS_TOKEN`, `PREVIEW_PUBLIC_BASE_URL` auf die öffentliche
   HTTPS-Origin des Dienstes setzen, WebSockets müssen erlaubt sein).
3. Web-App als statischen Dienst bereitstellen; `APP_ALLOWED_ORIGINS`
   der API um die Web-Origin ergänzen.

## Phase 5 — DNS-Cutover

1. `app.cybersarah-ki.com` als Custom Domain auf den Render-API-Dienst
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

Keine — Zielplattform (Render+Neon, Sprint 54) und Umfang (alles) sind beschlossen.

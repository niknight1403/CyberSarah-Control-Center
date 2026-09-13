# Sprint 84 — Custom Domain und Domain-Mapping (Render-Phase 5)

**Datum:** 13.09.2026
**Ziel (Akzeptanzkriterium aus `NEXT_STEPS.md`):** `app.cybersarah-ki.com` ist auf den Render-App-Service gemappt; die CORS-Konfiguration des Workspace-Service akzeptiert die Custom Domain; HTTPS/Redirect-Verhalten ist dokumentiert und die Verbindungsprüfung der App gegen die produktive URL ist grün.

## 1. Ist-Zustand nach Abschluss (produktiv verifiziert, 13.09. 21:36 UTC)

| Prüfung | Messwert |
| --- | --- |
| Custom Domain | `app.cybersarah-ki.com`, Render-ID `cdm-dahr2vafngtc73dn8pqg`, Typ `subdomain` |
| DNS (via DNS-over-HTTPS gemessen) | `app.cybersarah-ki.com` CNAME → `cybersarah-control-center-hmlc.onrender.com.` (TTL 300) |
| Verifikationsstatus | `verified` (manuell angestoßen, siehe Abschnitt 3) |
| `APP_BASE_URL` (produktive ENV) | `https://app.cybersarah-ki.com` |
| `GET /api/health` auf der Custom Domain | **200 OK** (`{"ok":true,…}`) |
| HTTP→HTTPS-Redirect | **301** → `https://app.cybersarah-ki.com/api/health` (Render-Edge leitet automatisch um) |
| Workspace-CORS für die Custom Domain | `Access-Control-Allow-Origin: https://app.cybersarah-ki.com` (Origin wird akzeptiert/echogt) |
| `APP_ALLOWED_ORIGINS` | Custom Domain + `*.onrender.com`-Origin + `www` + `localhost`-Varianten + `capacitor://localhost` |

## 2. Was umgesetzt wurde

| Änderung | Ort |
| --- | --- |
| Neuer `--domain`-Modus: Domain anlegen (falls fehlt), Verifikation abwarten, `APP_BASE_URL` auf die produktive URL patchen, Re-Deploy, End-to-End-Verifikation (Health, Redirect, Workspace-CORS) | `scripts/render-deploy.mjs` (`deployCustomDomain()`) |
| Gemeinsamer App-ENV-Builder für `deployApp()` und `deployCustomDomain()` | `scripts/render-deploy.mjs` (`makeAppEnvBuilder()`) |
| `apiFetch` protokolliert bei API-Fehlern Methode + Pfad der fehlgeschlagenen Anfrage | `scripts/render-deploy.mjs` |
| Workflow-Target `domain` (workflow_dispatch) | `.github/workflows/render-deploy.yml` |

Der onrender-Domain bleibt als Origin erlaubt — alte Clients/Bookmarks funktionieren weiterhin; die produktive Basis-URL (Deep Links, OAuth-Redirects, Stripe-Return-URLs) zeigt auf die Custom Domain.

## 3. Render-API-Erkenntnisse (hard erarbeitet, dokumentationswürdig)

- **Custom Domains liegen unter `/v1/services/{serviceId}/custom-domains`** — nicht unter `/domains`. Ersterer Versuch lief auf eine blanke `404 page not found`; die `apiFetch`-Instrumentierung (`[GET /services/{id}/domains?limit=20] 404 …`) machte den Fehler in einem Rerun sofort zuordenbar.
- **Verifikationsstatus:** Enum `verified` \| `unverified` (nicht `pending`). Abruf einzelner Domains per **Name ODER ID** (`customDomainNameOrID`-Pfadparameter).
- **Manueller Verify-Trigger:** `POST /v1/services/{serviceId}/custom-domains/{nameOderId}/verify` (202 Accepted). Die Domain war per CNAME korrekt gemappt und servierte bereits Traffic, blieb aber über 15 Minuten auf `unverified`, weil die automatische Hintergrunds-Verifikation den nachträglichen DNS-Wechsel nicht erfasste. **Ein** Verify-Aufruf → 30 Sekunden später `verified`. Das Skript stößt die Verifikation deshalb bei `unverified` genau einmal an und pollt danach alle 30 s (Timeout steuerbar über `CUSTOM_DOMAIN_WAIT_MINUTES`, Default 15).
- **ENV-Patch löst keinen Auto-Deploy aus** (bekannt aus Sprint 85 / Neon-Postgres-Umbau): Phase 5 löst den Deploy des aktuellen Commits deshalb explizit aus und beobachtet die konkrete Deploy-ID bis `live` — im Abschlussrun sauber sichtbar (`dep-dajhdqtg1s2s73apdheg`: `build_in_progress` → `update_in_progress` → `live`).

## 4. Betriebs-Runbook

Domain-Änderungen (andere Subdomain, weitere Domain, Re-Verify nach DNS-Wechsel):

1. DNS beim Provider setzen: Subdomain als **CNAME auf die onrender-Domain des App-Services** (`cybersarah-control-center-hmlc.onrender.com`).
2. GitHub-Secrets optional: `CUSTOM_DOMAIN` (Default `app.cybersarah-ki.com`), `CUSTOM_DOMAIN_WAIT_MINUTES`.
3. GitHub Actions → Workflow **Render Deploy** → *Run workflow* → Target `domain`.
4. Der Run legt die Domain an (falls fehlt), stößt die DNS-Verifikation an, patcht `APP_BASE_URL` + Origins, deployed und verifiziert Health/Redirect/CORS — bei Fehlern mit Methode + Pfad der fehlgeschlagenen Render-API-Anfrage.

## 5. Abschluss-Check

- Workflow-Run `34784016677` (Commit `94e3029`): **completed / success** — „Sprint 84 abgeschlossen: Custom Domain live, produktive URL verifiziert.“
- CI auf `94e3029` grün; tsc sauber; 579/579 Tests grün.
- Alle drei Teilziele des Akzeptanzkriteriums erfüllt und produktiv gemessen (Tabelle in Abschnitt 1).

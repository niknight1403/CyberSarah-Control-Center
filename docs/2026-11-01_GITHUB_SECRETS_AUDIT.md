# GitHub-Secrets-Audit (01.11.2026)

**Anlass:** Pruefung aller Repository-Secrets nach der Anbieter-Rotation. Werte
sind ueber die GitHub-API grundsaetzlich nicht lesbar; geprueft wurden Existenz,
Aenderungsdatum und ob ein Workflow den Namen tatsaechlich liest.

**Stand:** 01.11.2026, 18:00 Berlin. Branch `fix/llm-rotation-integrity-20261101`.

## Bestand

- **99 Secrets** auf Repository-Ebene
- **0** auf Organisationsebene (persoenliches Konto, keine Org)
- **0** auf Environment-Ebene (`Preview` und `Production` existieren, ohne Schutzregeln)
- **94** verschiedene Namen werden in `.github/workflows/*.yml` gelesen
  (ohne das eingebaute `GITHUB_TOKEN`), davon loesen **60** auf
- **34** fehlen, davon **3** durch `||`-Fallback gedeckt, **31** wirklich fehlend
- **39** Secrets liest kein einziger Workflow

## Korrektur einer frueheren Einschaetzung

Die drei `AI_*`-Providernamen im Smoke-Test sind **kein** Defekt. Die Datei
liest `${{ secrets.AI_GEMINI_API_KEY || secrets.GEMINI_API_KEY }}` und deckt
damit ueber den Fallback die vorhandenen Secrets ab. Ein reiner Namensabgleich
ohne Auswertung des `||` meldet hier falschen Alarm.

Der echte Defekt im selben Workflow war das Modell: `provider-smoke-test.yml`
testete `openai/gpt-oss-20b`, das laut Key-Changer am 01.11.2026 um 15:43 UTC
nicht mehr in der Groq-Liste steht. Der Test waere mit HTTP 404 rot gelaufen.
Angepasst auf `qwen/qwen3.8-27b` (live mit 200 bestaetigt).

## Wirklich fehlende Secrets (31)

### Publishing-Kanaele (inaktiv, Deploy bleibt trotzdem gruen)
  - `FB_ACCESS_TOKEN`
  - `IG_ACCESS_TOKEN`
  - `INSTAGRAM_PUBLISH_TOKEN`
  - `INSTAGRAM_PUBLISH_USER_ID`
  - `LINKEDIN_PUBLISH_TOKEN`
  - `LINKEDIN_PUBLISH_USER_URN`
  - `THREADS_PUBLISH_TOKEN`
  - `THREADS_PUBLISH_USER_ID`
  - `TIKTOK_ACCESS_TOKEN`
  - `TIKTOK_PUBLISH_TOKEN`
  - `YT_ACCESS_TOKEN`

### KI-Provider
  - `CEREBRAS_API_KEY`
  - `MISTRAL_API_KEY`
  - `OPENAI_API_KEY`

### Integrationen und Werkzeuge
  - `AUDIT_TARGET`
  - `CODECOV_TOKEN`
  - `CUSTOM_DOMAIN`
  - `EXTERNAL_ACTION_AUDIT_URL`
  - `FIRECRAWL_API_KEY`
  - `GITLAB_PROJECT_PATH`
  - `GITLAB_TOKEN`
  - `HETZNER_DNS_API_TOKEN`
  - `HUBSPOT_ACCESS_TOKEN`
  - `RESEND_FROM_EMAIL`

### Betrieb und Deploy
  - `ADMIN_GITHUB_TOKEN`
  - `AGENTEN_VILLA_DATABASE_URL`
  - `AGENTEN_VILLA_GOOGLE_CLIENT_SECRET`
  - `DIGISTORE24_IPN_PASSPHRASE`
  - `DIGISTORE24_IPN_SECRET`
  - `WORKSPACE_ALLOWED_ORIGIN`
  - `WORKSPACE_STORAGE_PERSISTENT`


`render-deploy.yml` schiebt diese Namen bei jedem Push nach `main` an Render.
Fehlende Secrets kommen dort leer an; die Modus-Aufloesung ignoriert inaktive
Kanaele, deshalb faellt nichts auf.

## Secrets ohne Workflow-Referenz (39)

  - `ALLOWED_ORIGINS`
  - `API_AUTH_TOKEN`
  - `APP_ENV`
  - `CAX_SSH_KEY`
  - `CYBERSARAH_API_STATUS_MONITOR_ENABLED`
  - `CYBERSARAH_AUTONOMY_ENGINE_ENABLED`
  - `CYBERSARAH_PERSISTENT_AUTOPILOT_ENABLED`
  - `CYBERSARAH_PERSISTENT_AUTOPILOT_INTERVAL_SECONDS`
  - `CYBERSARAH_REVENUE_READINESS_GOVERNOR_ENABLED`
  - `DEPLOY_TOKEN`
  - `DIGISTORE24_VENDOR_ID`
  - `ENVIRONMENT`
  - `EXPO_PUBLIC_OAUTH_SERVER_URL`
  - `EXPO_TOKEN`
  - `FLYWHEEL_SIMULATION_MODE`
  - `FREQTRADE_API_PASSWORD`
  - `FREQTRADE_API_USER`
  - `HARA_RUNTIME_ENABLED`
  - `HETZNER_NODES`
  - `HUB_URL`
  - `LIVE_MODE`
  - `LOCAL_ADMIN_AUTH_ENABLED`
  - `LOCAL_ADMIN_PASSWORD_HASH`
  - `LOCAL_ADMIN_USERNAME`
  - `N8N_BASIC_AUTH_USER`
  - `NODE_ENV`
  - `OAUTH_PUBLIC_ORIGIN`
  - `ONCHAIN_TREASURY_ADDRESS`
  - `OPENAI_BACKUP_KEY`
  - `ORACLE_HUB_IP`
  - `PORT`
  - `SERVER_IP`
  - `SESSION_SECRET`
  - `SIMULATION_MODE`
  - `STRIPE_PAYMENT_LINK`
  - `STRIPE_PUBLISHABLE_KEY`
  - `VITE_ANALYTICS_WEBSITE_ID`
  - `VITE_API_AUTH_TOKEN`
  - `VITE_APP_URL`

29 dieser Eintraege tragen denselben Zeitstempel `26.09.2026`, also einen
Sammelimport. Sie sind in diesem Repo tot, koennen aber anderswo leben
(n8n, Hetzner, manuelle Deploys). **Vor dem Loeschen gegen Render und n8n
abgleichen** — von hier aus nicht pruefbar, weil kein Render- oder n8n-Zugang
im Workspace liegt.

## `deploy.yml` ist irrefuehrend

Der Workflow `CyberSarah Deploy & Sync Secrets` laeuft bei jedem Push auf `main`,
schreibt `.env` im Runner, setzt `chmod 600` und meldet "Bereit fuer Server-Sync".
Es folgt kein Sync: kein rsync, kein SSH, kein Deploy-Schritt. Das Artefakt
verschwindet mit dem Runner. Die vier Social-Tokens, die er einsammelt
(`IG_`/`YT_`/`TIKTOK_`/`FB_ACCESS_TOKEN`), fehlen ohnehin alle.

Empfehlung: entweder echten Sync bauen oder den Workflow entfernen, damit der
gruene Haken nicht faelschlich Sicherheit suggeriert.

## Secret Scanning

Zwei offene Alerts (Nummern 3 und 4, "Stripe Webhook Signing Secret",
`tests/stripe-admin-status-logic.test.ts` Zeilen 9 und 41) wurden als
**False Positive** geschlossen: synthetische Fixtures aus zusammengesetzten
Teilstrings (`["whsec","signingsecretneverexpose"].join("_")`), kein echtes
Geheimnis.

## Offene Punkte

1. `OPENAI_API_KEY` und die Publishing-Tokens fehlen: entweder hinterlegen oder
   die Kanaele in der Modus-Aufloesung endgueltig als inaktiv dokumentieren.
2. `CEREBRAS_API_KEY` und `MISTRAL_API_KEY` hinterlegen wuerde die Rotation
   wieder auf mehr als einen Anbieter stuetzen.
3. Die 39 ungenutzten Secrets gegen Render-ENV und n8n abgleichen, dann
   aufraeumen. Dafuer wird ein Render-API-Key im Workspace gebraucht
   (`RENDER_API_KEY` existiert als Repository-Secret, ist aber nicht lesbar).
4. `deploy.yml` entfernen oder reparieren.

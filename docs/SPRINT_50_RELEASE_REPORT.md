# Sprint 50 — Abschlussbericht: Deployment-ENV-Härtung nach Config-Audit

**Datum:** 08.09.2026
**Ziel:** Die im Config-Audit (07.09.2026) gefundenen Lücken schließen: fehlende ENV-Durchreichung für OAuth/Stripe/Proxy, Klartext-Secrets in der Doku, fehlender METRICS_TOKEN als Actions-Secret.

## 1. ENV-Durchreichung erweitert

`lib/koyeb-deploy-logic.mjs` — `buildServiceEnv` reicht jetzt optional durch:

- `OAUTH_SERVER_URL` (Login-/Owner-Funktionen, Wert aus GitHub-Actions-Secret)
- `OWNER_OPEN_ID`
- `ADMIN_EMAIL`
- `STRIPE_MODE`
- `STRIPE_PRICE_LOOKUP_KEY` (autonome Abo-Preiswahl)
- `STRIPE_PRICE_ID`
- `TRUST_PROXY` (Default `1` im Deploy-Skript — Koyeb terminiert TLS im Proxy, X-Forwarded-For/-Proto wird für Rate-Limiting und Cookies benötigt)

Alle Werte nur bei Vorhandensein (deterministisch, Pflicht-ENVs und Zeilenumbruch-Schutz unverändert). `scripts/koyeb-deploy.mjs` liest sie aus der Umgebung, `.github/workflows/koyeb-bootstrap.yml` ergänzt OAuth-ENVs aus den Actions-Secrets und setzt `STRIPE_MODE=live` sowie `STRIPE_PRICE_LOOKUP_KEY=cybersarah-monthly` als feste Deploy-Defaults.

Vorher wären OAuth-Login und autonome Preiswahl auf Koyeb ohne manuelle Konsolen-Nacharbeit ausgefallen; TRUST_PROXY fehlte vollständig.

## 2. Secret-Hygiene

- Die Produktionswerte von `JWT_SECRET` und `METRICS_TOKEN` (aus der VPS-Ära) standen im Klartext in `docs/koyeb-deployment.md` — entfernt; die Doku verweist auf die GitHub-Actions-Secrets. Repo-weiter Scan (md/ts/json, ohne node_modules) bestätigt: keine Vorkommen mehr.
- `METRICS_TOKEN` ist jetzt als GitHub-Actions-Secret hinterlegt (via API, libsodium-verschlüsselt) — `/api/metrics` ist damit beim Bootstrap-Deploy automatisch geschützt. Gesamt: 53 Repo-Secrets.
- Hinweis (bewusst nicht automatisiert): Die `JWT_SECRET`-Rotation bleibt dem Owner vorbehalten, da der VPS bis zum DNS-Cutover mit dem alten Secret läuft.

## 3. Doku-Korrekturen

- `EXPO_PUBLIC_API_BASE_URL`-Absatz entfernt: kein Code im Repo liest die Variable (grep-verifiziert); Mobile-Builds beziehen die API-Adresse aus den In-App-Einstellungen.
- Empfohlene Koyeb-Variablen um `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `TRUST_PROXY=1` ergänzt; Hinweise zu automatischer Durchreichung ergänzt.

## 4. Regression

- `tsc --noEmit`: sauber
- `tests/koyeb-deploy-logic.test.ts`: 17/17 grün (16 + 1 neu)
- Skript-Syntax (`node --check`): OK
- Volle Suite: siehe todo.md-Eintrag (292/292 erwartet, alle grün)

## 5. Offen (Issue #3)

- Gültiger `KOYEB_TOKEN` als Actions-Secret (nur Owner im Koyeb-Dashboard erstellbar)
- `DATABASE_URL` nach Anlage der Koyeb-Postgres aktualisieren (Jetziger Wert ist eine VPS-Altlast)

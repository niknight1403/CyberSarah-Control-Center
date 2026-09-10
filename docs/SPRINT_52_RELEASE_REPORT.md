# Sprint 52 — Abschlussbericht: Workspace-Service deployment-fähig auf Koyeb

**Datum:** 10.09.2026
**Ziel:** Den Workspace-Service (Git-/Preview-/Agent-Runtime, Port 8787) als separate Koyeb-App deploybar machen — inklusive eines kritischen Health-Check-Fixes.

## 1. Kritischer Fix: Health-Endpoint war token-geschützt

`workspace-service/src/index.js` — `GET /api/v1/health` stand hinter `requireServiceAuthorization`. Koyeb-Health-Checks senden **keinen** Bearer-Token → der Dienst hätte 401 geantwortet und **niemals** den Status Healthy erreicht. Der Endpoint ist jetzt bewusst öffentlich; die Antwort (`status`, `version`, `previewUrl`) enthält keine Secrets. Alle anderen Routes bleiben token-geschützt.

## 2. Deploy-Logik erweitert (lib/koyeb-deploy-logic.mjs)

- `buildAppCreateRequest`: neuer Parameter `healthCheckPath` (Default `/api/health`, rückwärtskompatibel)
- Neue `buildWorkspaceEnv`: Pflicht-`SERVICE_ACCESS_TOKEN` (der Dienst verweigert in Produktion ohne Token den Start), Optionals `ALLOWED_ORIGIN`/`PREVIEW_PUBLIC_BASE_URL`, Zeilenumbruch-Schutz, `PORT=8787`, `NODE_ENV=production`
- `maskSecrets` maskiert jetzt auch `SERVICE_ACCESS_TOKEN=…`, `METRICS_TOKEN=…`, `JWT_SECRET=…` im Dry-Run-Output (vorher stand der Token im Klartext im Request-Body)

## 3. Deploy-Skript: --workspace-Modus (scripts/koyeb-deploy.mjs)

- Fail-Fast ohne `SERVICE_ACCESS_TOKEN` (Exit 2, klare Meldung)
- Legt App `cybersarah-workspace` an (Service `workspace`, Docker-Builder, Port 8787, Health-Check `/api/v1/health`, Region fra)
- Wartet auf Healthy, patcht `ALLOWED_ORIGIN`/`PREVIEW_PUBLIC_BASE_URL` mit der echten Domain, verifiziert den Health-Endpoint öffentlich
- Dry-run verifiziert: Request-Body korrekt, Secrets maskiert

## 4. Workflow + Doku

- `koyeb-bootstrap.yml`: neuer `workflow_dispatch`-Input `target` (`app` | `workspace`), separater Workspace-Deploy-Step (YAML validiert; Schritt-Namen ohne `: ` — PyYAML hat den Fehler vor dem Push aufgedeckt)
- `docs/koyeb-deployment.md`: neue Sektion „Workspace-Service separat deployen" mit Begründung des öffentlichen Health-Endpoints und Volume-Hinweis: `WORKSPACES_DIR` liegt ohne Koyeb-Volume auf ephemeraler Disk — Volume-Anhängung ist ein Owner-Konsolen-Schritt

## 5. Regression

- `tests/koyeb-deploy-logic.test.ts`: 27/27 grün (21 + 6 neu: buildWorkspaceEnv ×3, healthCheckPath ×2, maskSecrets ×1)
- Volle Suite: 297/297 grün, tsc sauber, workspace-service-Syntax OK, CI auf dem Sprint-Commit grün

## 6. Nächste Schritte

- Workspace-Deploy läuft mit `target: workspace` im Bootstrap-Workflow, sobald `KOYEB_TOKEN` + `SERVICE_ACCESS_TOKEN` als Actions-Secrets existieren
- Volume-Anhängung für `WORKSPACES_DIR` in der Koyeb-Konsole (Owner)

# Sprint 87 — Admin-Auto-Provisioning des GitHub-Tokens & readyForChat-Fix

**Datum:** 14.09.2026 · **Commits:** Sprint-87-Feature-Commit auf main · **Tests:** 600/600 grün

## Ausgangslage

Zwei zusammenhängende Probleme aus dem Live-Betrieb (app.cybersarah-ki.com):

1. **Login-Fehler:** Die Anmeldung des Administrators schlug fehl („E-Mail-Adresse oder Passwort sind nicht korrekt"), obwohl das Admin-Konto am 13.09. per Seeding-Workflow provisioniert war. Ursache: das im Secret hinterlegte Passwort war dem Owner nicht mehr bekannt.
2. **readyForChat-Bug:** Chat- und Agent-Screen meldeten „KI-Provider nicht konfiguriert", obwohl der Admin-Provider `auto` (Autonomer Superagent, Sprint 71) aktiv war. Der Bereitschafts-Check kannte nur `managed` und `hasProviderKey`.

## Fix 1: readyForChat erkennt den Auto-Router

`readyForChat` in `app/(tabs)/chat.tsx` und `app/(tabs)/agent.tsx` prüft jetzt zusätzlich `settings.provider === "auto"`. Der Auto-Router nutzt die Managed-LLM-Endpoint-Auflösung (Sprint 85/86) und benötigt keinen lokalen Provider-Key — die Prüfung sperrte ihn zu Unrecht aus.

## Fix 2: Server-seitige GitHub-Token-Provisionierung

**Muster (Sprint-Protokoll): reine Logik in `lib/` + deterministische Tests in `tests/`.**

- **`lib/admin-integrations-logic.ts`** — `resolveAdminGithubToken(env, isAdmin)` entscheidet rein und deterministisch, ob ein server-seitig hinterlegtes Token ausgeliefert wird: nur für Admins, nur plausible PAT-Formate (`ghp_…`, `github_pat_…`, Wiederverwendung von `isPlausibleGithubToken` aus der GitHub-Integration), `ADMIN_GITHUB_TOKEN` hat Vorrang vor dem generischen `GITHUB_TOKEN`-Fallback, Whitespace wird getrimmt.
- **`server/admin-router.ts`** — tRPC-Router `admin.githubToken` hinter `adminProcedure` (server-seitige Rollenprüfung `role === "admin"`). Liefert `{ token }` oder `{ token: null }`; niemals ein Token an Nicht-Admins.
- **`lib/use-admin-github-token-sync.ts`** — Client-Hook nach dem `useAdminAutoRouter`-Muster: sobald ein Administrator angemeldet ist und lokal noch kein GitHub-Token gespeichert ist, holt der Hook das Server-Token einmalig pro Sitzung und speichert es in den lokalen Settings (SecureStore). Idempotent, Best-Effort-Fehlerbehandlung (Retry beim nächsten Mount).
- **Registrierung:** `admin`-Router in `server/routers.ts`; Hook in Agent-Screen und Settings-Screen eingebunden.

Der Administrator muss sein GitHub-Token damit nicht mehr manuell kopieren — es wird nach dem Login automatisch provisioniert.

## Fix 3: Admin-Passwort neu provisioniert

`ADMIN_PASSWORD` als GitHub-Actions-Secret neu gesetzt (Owner-Vorgabe), `seed-admin`-Workflow (workflow_dispatch) erfolgreich ausgeführt — `ensureAdminAccount` updated das bestehende Konto idempotent (E-Mail niko.oeben@gmail.com, Rolle admin) gegen die Neon-Produktions-DB. Login danach funktional.

## Verifikation

- 600/600 Tests grün (8 neue für `resolveAdminGithubToken`; die 2 workspace-service-Smoke-Tests waren umgebungsbedingt rot und laufen nach lokaler `npm install --omit=dev` im workspace-service grün).
- `tsc --noEmit` sauber bis auf die bekannten lokalen expo-router-Typdeklarationen in `components/haptic-tab.tsx` (unverändert, kein Sprint-87-Code).
- Offen für den Betrieb: Render-Env `ADMIN_GITHUB_TOKEN` am App-Service setzen, Deploy auslösen, Live-Verifikation der Provider-/GitHub-Karten nach Admin-Login.

## Sicherheit

- Token-Auslieferung ausschließlich über die admin-geschützte tRPC-Query; das reine Logikmodul kann nicht ohne Server-Autorität ein Token freigeben.
- Das Token liegt server-seitig nur im Render-Environment (nicht im Repository, nicht in GitHub-Actions-Secrets für den App-Service).

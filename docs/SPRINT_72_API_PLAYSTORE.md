# Sprint 72 — API-Fehlerbehebung & Play-Store-Build

**Datum:** 2026-09-10 · **Status:** abgeschlossen, 457/457 Tests grün, tsc sauber, Laufzeit-Checks grün

## Fehlerbild (gemeldet)

1. "Failed to fetch" bei Registrierung/Login (`/api/auth/register`, `/api/auth/login`)
2. "Unexpected token '<', <!DOCTYPE…" bei Repository-/GitHub-Integration

## Diagnose

Die Auth- und GitHub-Flows laufen in der aktuellen Codebasis über tRPC (`/api/trpc`, `account.register`/`account.login` bzw. Workspace-Router) — die gemeldeten REST-Pfade existieren als Altlast. Der Server war seit Sprint 69 bereits gehärtet (globale JSON-404/500-Handler, `/api/*`-GETs erhalten nie HTML). Die Fehlerquelle ist der **alte Produktionsstand auf dem VPS (Commit facf17e, vor Sprint 68/69)**: dort liefern unbekannte API-Pfade noch die SPA-index.html (200, text/html) → clientseitiges JSON.parse scheitert am DOCTYPE; und tote/falsche Server-URLs erzeugen nackte "Failed to fetch"-TypeErrors. Abhilfe: VPS-Deploy auf aktuellen main (Render-Migration) + clientseitige Härtung (dieser Sprint).

## Umsetzung

- **`lib/api-response-logic.ts`** — `parseSuccessfulResponse` (2xx-Antworten strukturiert interpretieren; HTML/Proxy-Antworten → klare Meldung statt SyntaxError), `looksLikeJsonBody`, `describeNetworkFailure` ("Failed to fetch" → handlungsleitende Meldung mit Ziel-URL). 6 deterministische Tests.
- **`lib/_core/api.ts`** — `apiCall` nutzt die neue Logik; TypeError-Netzwerkfehler werden übersetzt.
- **Android:** `release`-buildType mit `minifyEnabled true` + `shrinkResources true` (R8), `proguard-rules.pro` mit WebView-/JS-Bridge-, Capacitor-Reflexions- und Kotlin-Metadaten-Keep-Regeln, Workflow um `bundleRelease` erweitert — das unsignierte Play-AAB (`.aab`) wird als Artefakt `CyberSarah-ControlCenter-aab` bereitgestellt; Play-Signierung bleibt bewusst Owner-Handoff.

## Laufzeit-Verifikation

- Server-Boot ohne DB: `/api/health` → `{"ok":true}`
- `GET /api/auth/register` → 404 `application/json` (kein HTML)
- `POST /api/auth/login` → 404 `application/json` mit path/method

## Master-Prompt-Abgleich (Punkte, die bereits durch Sprints 49–71 grün sind)

| Punkt | Status |
| --- | --- |
| Ollama (`11434/v1`) / LM Studio (`1234/v1`) vordefiniert | ✅ `studio-settings-logic` |
| Workspace-Autonom-Init + Standard-Repo `CyberSarah-revenue-os/main` | ✅ Sprint 69 v2 |
| Session-Restore nach Neustart (SecureStore + Bearer-Header) | ✅ `_core/auth.ts`, `account.tsx` |
| `niko.oeben@gmail.com` → automatische Admin-Rolle | ✅ `server/db.ts` (ADMIN_EMAIL-Default) |
| Branch-Konsolidierung (nur noch `main`) | ✅ 2026-09-10, alle Alt-Branches gelöscht |
| Stripe Lite/Pro/Expert + Webhooks + Verwaltung | ✅ Sprint 70 |
| Auto-Router "Autonomer Superagent" an oberster Stelle | ✅ Sprint 71 |
| Offline-Fallback | ✅ `lib/offline-action-logic` |
| Kauf-Wiederherstellung | ✅ Stripe-Architektur: `billing.status`-Refetch beim Login |

**Offener Owner-Schritt:** Produktionsserver auf aktuellen Stand bringen (Render+Neon: `RENDER_API_KEY` als Actions-Secret, `DATABASE_URL` auf Neon, dann Workflow-Start) — erst dann verschwinden die gemeldeten Fehler auch auf app.cybersarah-ki.com.

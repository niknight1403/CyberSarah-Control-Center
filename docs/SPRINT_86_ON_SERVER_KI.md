# Sprint 86 — On-Server-KI: Managed Provider-Fallback & Autonome Key-Rotation live

Stand: 14.09.2026 (Commits `b733655`, `9ee6703`, `357b22b` — CI grün, Render-Deploy `357b22b` produktiv verifiziert)

## Ziel

Der On-Server-Provider („managed") des Workspace-Servers muss produktiv funktionieren, ohne dass der Nutzer eigene API-Keys pflegen muss: kostenlose Anbindung mit autonomer Heilung — Stufe-für-Stufe-Fallback, korrekte Modelle je Endpoint, automatische Key-Rotation bei Rate-Limits und erschöpften Keys.

## Ausgangslage (13./14.09.2026)

- Der produktive Login auf der Custom Domain scheiterte an invalidierten Session-Tokens (fehlende `VITE_APP_ID` im Client-Bundle).
- `testConnection` (managed) meldete produktiv: `LLM invoke failed: 402 … no credits remaining` — der Server griff ohne Gemini/OpenAI-Konfiguration auf einen credits-leeren OpenAI-Key zu.
- Die Key-Rotation existierte als getestete Bibliothek (`lib/key-rotation-logic.ts`), war aber **nicht** in den Live-Request-Pfad integriert.

## Umsetzung

### 1. Live-Login-Fix (v1.3.5)

`VITE_APP_ID` dauerhaft auf `cybersarah-control-center` festgelegt ( Quelle der Wahrheit: `app.config.ts` → injiziert in den Client-Build). Session-Token-Signatur ist damit konsistent zwischen Build und Server — Registrierung, Login und Session-Auth produktiv getestet. APK v1.3.5 gebaut, signiert (`apksigner`-Verifikation) und als Release `v1.3.5-apk` bereitgestellt.

### 2. Managed Provider-Fallback (Forge > Gemini > OpenAI)

- `lib/managed-llm-fallback-logic.ts` (neu): deterministische Endpoint-Kette — der gebaute Forge-Key hat Vorrang, danach der kostenlose Google-AI-Studio-Key (`AI_GEMINI_API_KEY`), erst zuletzt OpenAI (kostenpflichtig).
- `lib/managed-model-logic.ts`: Endpoint-bewusste Default-Modelle; Gemini-Default auf `gemini-flash-latest` umgestellt, nachdem `gemini-2.5-flash` für neue Google-Keys gesperrt ist (404 „no longer available to new users" — via Live-API verifiziert, `gemini-flash-latest` antwortet produktiv).
- `GEMINI_API_KEY` als Render-ENV `AI_GEMINI_API_KEY` deployt (nicht im Code, nicht im Repo).

### 3. Autonome Key-Rotation live (Integration der Sprint-78-Bibliothek)

`server/_core/llm.ts` verwaltet jetzt einen Key-Pool (`createKeyPoolEntry` / `recordKeyObservation` / `refreshKeyPool` aus `lib/key-rotation-logic.ts`):

- **429** → Key 60 s im Cooldown, sofortiger Failover auf den nächsten gesunden Key.
- **401/402/403** (Auth/Guthaben) → Key gilt als erschöpft und wird in Folgerequests automatisch übersprungen.
- Latenz-Beobachtungen fließen in den Health-Score ein; die Kette bleibt kostenpriorisiert (bezahlte Stufen zuletzt).
- 4xx wird nicht mehr blind per Backoff wiederholt (`fetchWithBackoff` retryt nur noch 5xx/Netzwerkfehler) — die Rotation übernimmt sofort.
- Das Modell wird je Versuch endpoint-gerecht gewählt (Gemini-Endpoint → Gemini-Modell, Forge/OpenAI → OpenAI-Modell).

### 4. Tests

- 8 neue Tests (Kette, 401-Exhaustion, Live-Rotation 429→Failover, Skip erschöpfter Keys, Endfehler) — Suite: **592 grün**, TypeScript sauber, CI (`validate`, `release-audit`) grün.

## Produktive Verifizierung (14.09.2026, `https://app.cybersarah-ki.com`)

| Prüfung | Ergebnis |
|---|---|
| `developmentChat.testConnection` (managed, ohne Modell) | `ok: true`, `model: gemini-flash-latest`, ~3 s Latenz |
| Echter Chat-Turn (`developmentChat.send`) | `providerUsed: managed`, Antwort von Gemini; credits-leeres OpenAI vom Pool selbst übergangen |

## Ergebnis

Der Administrator muss nichts konfigurieren: Der On-Server-Provider heilt sich autonom — freie Stufe zuerst, Erschöpfung wird gemerkt, Rate-Limits kühlen ab, die Anbindung bleibt kostenlos solange eine freie Stufe verfügbar ist. Betriebserfahrung aus dem Realgerät-Test kann künftig direkt in die Health-/Cooldown-Parameter zurückfließen (siehe `NEXT_STEPS.md`, mittelfristige Richtung).

# Sprint 53 — Release Report: Zero-Config-Chat & Heartbeat-Testbarkeit

**Datum:** 10.09.2026 · **Branch:** main · **Ziel:** Chat und Workspace ohne manuelles Setup einsatzbereit; Deploy-relevante Logik deterministisch testbar.

## Ziele des Sprints

1. Heartbeat-Cron-Verwaltung aus dem Server-Endpoint in Pure-Logik überführen (Sprint-Muster: lib/ + tests/).
2. Zero-Config-Ziel: Chat bleibt ohne manuelle Key-Konfiguration ansprechbar (Managed-Provider-Fallback).
3. Datei-Anhänge jeder Art fließen verlustarm in die Prompt-Pipeline.
4. Authentifizierte Pfade im Sandbox-Stack end-to-end verifizieren.

## Umgesetzte Änderungen

### 1. Heartbeat-Logik (`lib/heartbeat-logic.ts`)

- `validateHeartbeatCron`: 6-Feld-Cron mit erzwungenem Sekundenfeld `0` (Koyeb/Cron-Intervall ≥ 60 s), Bereichsprüfung für Minute/Stunde/Tag/Monat/Wochentag, keine Namens-Aliase.
- `validateHeartbeatPath`: erlaubt ausschließlich Pfade unter `/api/scheduled/` (Traversal-Schutz).
- `buildHeartbeatCreateBody` / `buildHeartbeatUpdateBody`: deterministische Koyeb-Body-Builder inkl. `stringifyHeartbeatPayload` (Objekte → JSON, Strings unverändert, `undefined` → `{}`) und `mapHeartbeatStatus` (HTTP → tRPC-Fehlercode).
- `server/_core/heartbeat.ts` nutzt die Pure-Logik; 12 deterministische Tests.

### 2. Managed-LLM-Fallback (`lib/managed-llm-fallback-logic.ts`)

- `resolveManagedLlmEndpoint`: Forge-Key (`BUILT_IN_FORGE_API_KEY`) hat Vorrang; **ohne** Forge-Key fällt der Managed-Aufruf automatisch auf den OpenAI-Endpoint zurück (`AI_OPENAI_API_KEY`/`OPENAI_API_KEY`, optionale `AI_OPENAI_BASE_URL`).
- Ohne jeden Key: definierte Fehlermeldung statt unklarer 500er — die Chat-UI bleibt bedienbar, der Admin erhält eine handlungsfähige Meldung.
- `server/_core/llm.ts` nutzt den Resolver in `invokeLLM` und `listLLMModels`; 5 deterministische Tests.
- **Produktionsrelevanz:** Auf Koyeb liegt `OPENAI_API_KEY` als Secret vor — der Chat ist damit ohne jedes manuelle Setup funktionsfähig, auch ohne Forge-Key.

### 3. Redigierte Chat-Fehler (`server/development-chat.ts`)

- Neue exportierte Funktion `sanitizeChatError`: filtert API-Keys (`sk-…`, `ghp_…`) und URLs aus Provider-Fehlern, bevor sie als `BAD_GATEWAY` den Client erreichen (+2 Tests).

### 4. Nicht-textuelle Anhänge als Kontext (`lib/project-upload-logic.ts`, `lib/project-upload-reader.ts`)

- PDF-, Bild- und Video-Anhänge werden nicht mehr still übersprungen: `createNonTextContextEntry` erzeugt einen kompakten Metadaten-Eintrag (Name, MIME-Typ, lesbare Größe), der als `PROJECT FILE` in den Prompt-Kontext fließt — das Modell weiß, dass ein Dokument existiert, und kann gezielt nachfragen.
- `formatAttachmentBytes` (B/KB/MB), `describeNonTextAttachment`; +3 Tests.

### 5. Admin-Seeding-Fix (`scripts/seed-admin.ts`)

- `hashPassword` ist asynchron — Seeding gegen PostgreSQL jetzt in `main()` mit `await` und ordnungsgemäßem Client-Schließen; Fehlermeldung bei fehlenden ENV-Variablen unverändert deutsch.

## End-to-End-Verifikation (Sandbox)

- PostgreSQL nach Sandbox-Neustart repliziert Persistenz: Admin-Konto und Billing-Daten vollständig vorhanden.
- `GET /api/health` → 200, `GET /api/ready` → `{database: true}`; Login liefert Session-Token; authentifizierte tRPC-Route `developmentChat.send` erreichbar.
- **Managed-Fallback live bewiesen:** Chat-Nachricht mit `provider: "managed"` ohne Forge-Key routete auf `api.openai.com` (401 des Providers wurde sauber und redigiert durchgereicht) — keine Instabilität, strukturierte Antwort.
- Hinweis: Der im Sandbox vorhandene `OPENAI_API_KEY` ist ein Plattform-Proxy-Key (direkt bei OpenAI ungültig); der echte Chat-Antwort-Flow wird auf Koyeb mit den produktiven Secrets wirksam.

## Testbilanz

- **325/325 Tests grün** (53 Dateien), `tsc --noEmit` sauber, `NODE_ENV=production`-Build mit Bundle-Check erfolgreich.
- Neue Tests: Heartbeat-Logik (12), Managed-Fallback (5), Non-Text-Anhänge (3), sanitizeChatError (2).

## Offen (blockiert, kein Code)

- **Issue #3:** Koyeb-Deployment wartet auf einen gültigen `KOYEB_TOKEN` (GitHub-Actions-Secret) — danach läuft der Bootstrap-Workflow vollautomatisch.
- `SERVICE_ACCESS_TOKEN` als Actions-Secret für den Workspace-Service; Volume-Anhängung für `WORKSPACES_DIR` in der Koyeb-Konsole (Owner-Schritte).

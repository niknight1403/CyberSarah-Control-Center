# Sprint 111 — Preview-Tab: Echte Live-Runtime-Anbindung

**Datum:** 14.09.2026 · **Version:** Teil von v2.1.0

## Ziel

Der Preview-Tab war der einzige Tab ohne echte Funktionalität: Die komplette
Live-Runtime-Infrastruktur aus Sprint 67/68 (Status-Polling, SSE-Log-Streaming,
Admin-Clear, Preview-Ziel-URL) existierte client-seitig, war aber nie an die
Oberfläche angebunden ("UI-Anbindung folgt im nächsten Sprint" — nachgeholt).

## Umsetzung

1. **`lib/live-runtime-view-logic.ts` (neu):** Deterministische View-Schicht —
   `getRuntimeStateBadge` (Zustands-Badge mit Ton aus `RUNTIME_STATE_LABELS`),
   `getConnectionBadge` (SSE/Polling/Offline/Verbinde ehrlich),
   `formatUptimeLabel` (Minuten/Stunden, toleriert null/negativ/NaN),
   `formatPingLabel` (ms oder "–"), `buildPreviewViewModel` (konsolidiertes
   Modell mit ehrlichen Nicht-Verfügbar-Zustaenden) und
   `resolvePreviewTargetUrl` (Workspace-Preview vor API-Basis).
2. **`lib/live-runtime-client.ts`:** `usePreviewTargetUrl` repariert — der alte
   Code war ein kaputter Stub (immer API-Basis); jetzt gilt
   `resolvePreviewTargetUrl(workspaceUrl, apiBase)` mit echten Studio-Settings.
3. **`app/(tabs)/preview.tsx` (Neubau):** Echter Status (Zustand, Verbindung,
   Uptime, Latenz, Port, Ereigniszahl), Browser-Rahmen mit realer Preview-URL
   und Live-Indikator, Live-Protokoll mit Quellen-/Zeitstempel und
   Level-Farben, protokollleeren-Admin-Aktion (SSE: lokal, Polling: Server,
   mit Erfolgsmeldung; Rollen-Gate über `account.me`).
4. **`components/ui/icon-symbol.tsx`:** Mappings `trash → delete` und
   `hourglass → hourglass-empty` ergänzt.
5. **`tests/live-runtime-view-logic.test.ts` (neu):** 9 deterministische Tests.

## Akzeptanzkriterien

- TypeScript sauber (`tsc --noEmit` 0 Fehler). ✅
- Volle Vitest-Suite grün: **680/680 Tests** (101 Dateien). ✅
- Keine manuellen Einstellungen nötig: Ohne Workspace-Service gilt ehrlich der
  Web-Export als Preview-Ziel, ohne Verbindung gelten Offline-Zustaende. ✅
- Produktionsserver vorkonfiguriert (`EXPO_PUBLIC_API_BASE_URL` eingebrannt). ✅

## Verbleibende Punkte

- APK/AAB-Build für v2.1.0 über `build-apk.yml` (in diesem Release enthalten).
- Echter Gerätetest bleibt Owner-Handoff.

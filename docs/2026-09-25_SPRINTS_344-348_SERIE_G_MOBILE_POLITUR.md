# Sprints 344–348: Serie G Mobile-App-Politur (Batch 13)

**Datum:** 25.09.2026
**Commits:** a49d10e (Sprint 344), 02b6b43 (Sprint 345), folgend (Sprints 346–348)

## Sprint 344: Navigation-Pass
- Per-Tab-Routen-Stacks, ehrliche Zurück-Kette (pop -> Tab -> App)
- Deep-Link-Parsing mit klarer Ablehnung unbekannter Ziele

## Sprint 345: Offline-Zustände
- Konnektivitäts-Entprellung, ehrlicher Reconnect-Plan
- Einmal-Refresh, Queue-Resume nur bei stabilem Online
- Offline-Banner mit nie aufgerundeter Dauer

## Sprint 346: Lade-Erlebnis (Skeletons)
- `lib/skeleton-loading-logic.ts`: Screen-spezifische Skeleton-Presets (chat, media-studio, dashboard, settings, admin, integrations, billing)
- Hybrid-Modus für Teil-Daten: vorhandene Bereiche zeigen, fehlende als Skeleton
- MinDisplayMs (200ms) gegen Skeleton-Flackern
- Ehrlichkeits-Grenze: Unbekannte Screens bekommen Generic-Fallback, gekennzeichnet

## Sprint 347: Lokale Push-Benachrichtigungen (ohne FCM)
- `lib/local-notifications-logic.ts`: Schedule, Filter, Wiederholungs-Intervalle
- 5 Kategorien: chat-reply, task-reminder, quota-warning, deploy-status, system-alert
- Ehrlichkeits-Grenze: Nur auf dem Geraet, kein Cross-Device-Sync, kein FCM — bewusste Entscheidung
- Ohne Berechtigung: null statt stiller Fehler

## Sprint 348: APK-Größe + Startzeit
- `lib/apk-size-metrics-logic.ts`: Asset-Breakdown, Budget-Bewertung (25 MB), Top-Offenders
- Empfehlungen: Bild-Komprimierung (WebP), Tree-Shaking, Font-Reduktion
- Startzeit-Optimierungs-Empfehlungen mit Einsparungs-Schätzung
- Ehrlichkeits-Grenze: Fehlende Asset-Daten = "unknown", nicht 0

## Testanzahl
- Vorher: 1.957 Tests in 247 Dateien
- Nachher: 1.987 Tests in 250 Dateien (+30 Tests, +3 Dateien)

## Ehrlichkeits-Grenzen
- Skeletons: Fallback für unbekannte Screens als gekennzeichnetes Generic-Skeleton
- Lokale Notifications: Kein Server-Push, kein FCM, nur auf dem Erstellungs-Geraet
- APK-Metriken: Heuristische Empfehlungen, keine Garantie; fehlende Daten als "unknown"

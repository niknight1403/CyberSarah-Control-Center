# Changelog

Alle nennenswerten Aenderungen am CyberSarah Control Center werden hier
dokumentiert. Releases folgen der Versionierung MAJOR.MINOR.PATCH;
Sprint-Abschnitte darunter liefern die Detailtiefe je Iteration.

## 24.09.2026 — Sprints 284–288: Agent-Werkzeuge & Dev-Loop-Tiefe (Serie A Batch 1)

- Live-Preview-Zyklus Chat↔Preview (Sprint 284): Zustandssynchronisation, Verfolgung und Wiederherstellung ohne Zustandsverlust (`lib/live-preview-cycle-logic.ts`)
- Multi-File-Refactoring-Werkzeug (Sprint 285): Atomare Transaktionen für zeitgleiche Dateiänderungen (`write`/`delete`) mit automatischem Rollback und Backups (`lib/multi-file-refactor-logic.ts`)
- Code-Suche-Tool (Sprint 286): Grep-ähnliche Repository-Suche nach Regex/Text mit Dateimuster-Filter und Syntax-Range-Extraktion (`lib/code-search-logic.ts`)
- Test-Runner-Tool (Sprint 287): Gezielte Vitest-Ausführung für einzelne Testdateien und Namensfilter mit strukturierter Output-Zusammenfassung (`lib/test-runner-logic.ts`)
- Konfigurierbare Iterations-Limits (Sprint 288): Transparente Werkzeug-Limits (max. 8 Iterationen, Warnschwelle ab 6) und Dokumentation (`lib/dev-agent-iteration-limit-logic.ts`)
- 12 neue Tests (1.572 Tests grün in 188 Testdateien)

## 24.09.2026 — Sicherheits-Bereinigung cybersarah-revenue-os

- Alle vier DB-Backups (3 SQL-Dumps + 1 tar.gz) vollständig aus der Git-Historie von `cybersarah-revenue-os` entfernt (git filter-repo + Force-Push)
- Ehrliche Inhaltsprüfung über alle historischen Versionen: keine personenbezogenen Daten, keine Geheimnisse — Geheimnis-Rotation daher nicht erforderlich
- Restrisiko dokumentiert: GitHub-Cache alter SHAs bis zur internen GC

## 24.09.2026 — Sprint 278: Stripe-Webhook-Härtung

- Fehler-Trennung: Signatur-Fehler → 400, Verarbeitungs-Fehler → 500 (Stripe wiederholt)
- Best-Effort-Dedup verarbeiteter Event-IDs pro Instanz (ehrlich: In-Memory, kein Restart-Überleben)
- Ops-Alerts bei invoice.payment_failed und customer.subscription.deleted
- 3 neue Tests mit echt berechneten HMAC-Testsignaturen; 1.542 Tests grün

## 24.09.2026 — Sprints 279–283: Asset-Packs (Outfit & Sets) + Bugfix Szenenbilder

- Neues Modul Asset-Packs: pure Logik, nutzer-scoped Persistenz, tRPC-Router assetPacks (list/create/activate/remove/status)
- Pipeline-Integration: FLUX-Prompts mit Outfit-/Sets-Modifikatoren, Pack-Farben im Gradient-Rückfall, Cache-Key mit Pack-Signatur
- Medien-Studio: Pack-Verwaltung und Anzeige der für den nächsten Render wirksamen Packs
- Bugfix (Sprint 276): FfmpegAssembler verworf imagePath — FLUX-Szenenbilder wären in Produktion nie gerendert worden
- 15 neue Tests; 1.560 Tests grün (183 Dateien)

## 24.09.2026 — Sprints 276–277: FLUX-Szenenbilder + Medien-Studio-UI

- Szenenbild-Adapter: generateSceneImageForPipeline nutzt FLUX.1-schnell + Bild-Cache ohne Nutzer-Quote (Pipeline begrenzt über Video-Quote)
- ffmpeg-Builder: echte Bild-Variante (Cover-Skalierung 16:9 + Ken-Burns) neben deterministischem Farbverlauf-Rückfall
- Pipeline: pro Szene FLUX-Bild oder ehrlich gezählter Rückfall (sceneImages-Statistik + Klartext-Note), Lauf bricht nicht ab
- Medien-Studio-Screen (media-studio.tsx): Status/Limits, Stimmen-Chips, Freigabe-Pflicht, eingebetteter Web-Video-Player, vollständige Fehleranzeige

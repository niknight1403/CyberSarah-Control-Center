# CyberSarah Control Center — Nächste geplante Schritte

Stand: 2026-09-14 (Release **v1.3.5**; On-Server-KI produktiv — siehe Sprint 86)

## Abgeschlossen (Kurzbilanz)

- **Sprints 42–51:** Anbindung der Logic-Module an Oberfläche und Infrastruktur. Abschluss: `docs/SPRINT_42_51_ABSCHLUSSBERICHT.md`.
- **Sprints 52–73:** Server-Konsolidierung, Studio-UI, Hosting-Wechsel zu Render + Neon, Feuerwehr-Sprint 73 (R8-Fix). Berichte in `docs/`.
- **Sprints 74–82 (Autonomie-Programm, Module 1–5):** Design-System mit drei Themes (74), responsive Sidebar (75), Loop Engineering (76), Ziel-Zerlegung + Chat-Entwicklungsfenster (77), Key-Pool-Rotation mit Failover (78), MCP-Registry (79), GitHub-/Stripe-Vertiefung (80), RBAC-Tiers mit Admin-Dashboard (81), Gesamtregression und Release 1.3.0 (82). Abschlussbericht: `docs/SPRINT_74-82_AUTONOMIE_PROGRAMM_ABSCHLUSSBERICHT.md`.
- **Festgelegte Grundentscheidungen:** `android/` bleibt eingecheckt und ist die Quelle der Wahrheit für native Builds (Capacitor-APK-Pipeline inkl. Sprint-73-Fixes); `app.config.ts` steuert die Expo-/Web-Seite. Kein Umbau auf Expo-CNG. Major-Upgrades werden grundsaetzlich als separate Sprints durchgefuehrt. Commits werden via GitHub-Token auf `main` gepusht.

Akzeptanzkriterium je Sprint: TypeScript sauber, volle Vitest-Suite gruen (Ausnahme: bekannter umgebungsbedingter Sandbox-Smoke-Test, Port 18967), Server-Build erfolgreich, keine Secrets im Code, CI (`validate`, `release-audit`) gruen.

## Festgelegte nächste Schritte — Roadmap ab Sprint 83

| Sprint | Ziel | Akzeptanzkriterium |
|---|---|---|
| 83 | Play-Store-Release vorbereiten | Store-Listing (Titel, Kurz-/Langbeschreibung, Grafiken) ist gemäß `PLAY_STORE_BEREITSCHAFT.md` fertig dokumentiert; Screenshots der Kernscreens (Chat, Studio, Admin-Dashboard, Diff-Viewer) liegen als Assets bereit; der Upload-Pfad fuer das Release-AAB aus dem GitHub-Release `v1.3.0-apk` ist Schritt fuer Schritt beschrieben; Data-Safety-Formular ist ausgefuellt dokumentiert. |
| 84 | Custom Domain und Domain-Mapping abschließen (Render-Phase 5) | **Erledigt (13.09.) — produktiv verifiziert:** `app.cybersarah-ki.com` (CNAME → App-Service, Render `verified`) liefert `/api/health` 200; HTTP→HTTPS-Redirect 301; Workspace-CORS akzeptiert die Custom Domain; `APP_BASE_URL` zeigt auf die produktive URL, onrender-Domain bleibt erlaubt. Phase 5 ist als `--domain`-Modus im Render-Deploy-Workflow automatisiert (Anlegen, Verify-Trigger, ENV-Patch, Re-Deploy, End-to-End-Prüfung) — Details und Runbook: `docs/SPRINT_84_CUSTOM_DOMAIN.md`. |
| 85 | Persistent Disk für den Workspace-Service | **Erledigt (13.09.) — als KOSTENLOSE Alternative:** Statt der bezahlten Render-Disk persistiert der Workspace-Service jetzt über Neon-Postgres (`WORKSPACE_DATABASE_URL`, Schema `workspace_service`): Audit-Events + nicht gepushte WIP-Dateien überleben Re-Deploys. Health meldet `mode: "postgres"`, App-Diagnose zeigt „Persistenter Speicher aktiv (kostenloses Postgres-Backup)". Unit-Tests + Spawn-Smoke (DB-Ausfall → ehrlich ephemeral) grün. Render-Disk bleibt optionales Upgrade — siehe `docs/SPRINT_85_PERSISTENT_DISK.md` (Abschnitt 6b). |
| 86 | On-Server-KI: Managed Provider-Fallback & autonome Key-Rotation live | **Erledigt (14.09.) — produktiv verifiziert:** Der On-Server-Provider (managed) läuft produktiv über die Kette Forge > Gemini (kostenloser AI-Studio-Key) > OpenAI mit endpoint-bewussten Default-Modellen (`gemini-flash-latest`). invokeLLM integriert die Key-Rotations-Bibliothek live: 429 → 60-s-Cooldown mit sofortigem Failover, 401/402/403 → Key erschöpft und wird übersprungen, 4xx ohne Blind-Retry. Live getestet: `testConnection` ok (`model: gemini-flash-latest`), echter Chat-Turn über managed, credits-leeres OpenAI übergangen. 592 Tests grün — Bericht: `docs/SPRINT_86_ON_SERVER_KI.md`. |
| 91 | Kostenlose Qualitäts-Infrastruktur: Secret-Scanning, Dependabot, Test-Coverage | **Erledigt (14.09.):** Gitleaks-Workflow scannt jeden Push/PR (voller Verlauf, blockierend); Dependabot (npm ×2, GitHub Actions) liefert wöchentliche Update-PRs mit Expo-/RN-Gruppen, Major-SDK-Sprünge bleiben eigene Sprints; `npm run test:coverage` misst die Logik-Suite (v8-Provider, nur lib/server/shared/scripts), Coverage liegt als CI-Artifact bereit, optionaler Codecov-Upload via `CODECOV_TOKEN`. Bericht: `docs/SPRINT_91_QUALITAETS_INFRASTRUKTUR.md` (enthält die offenen Handoff-Punkte: Codecov, CodeRabbit, UptimeRobot, Snyk). |
| 87 | Expo-SDK-Major-Upgrade als separater Sprint | **Zur Zeit nicht anstehend:** Das SDK-57-Major-Upgrade ist abgeschlossen (11.09., `docs/SPRINT_SDK57_UPGRADE.md`), und SDK 57 ist die aktuelle Hauptversion. Dieser Sprint entsteht neu, sobald SDK 58 veroeffentlicht ist — dann Abhaengigkeits-Matrix aktualisieren, NativeWind-Hauptversionswechsel pruefen, strengeren Typecheck bereinigen, `android/`-Ordner manuell anpassen (Quelle der Wahrheit, kein CNG), Web-Export, Server-Build und Release-AAB-Pipeline gruen. |

### Detailplanung Sprint 83 — Play-Store-Release (zuerst)

1. `PLAY_STORE_BEREITSCHAFT.md` mit der aktuellen Version 1.3.0 abgleichen (Version, Berechtigungen, AAB-Verweis auf Release `v1.3.0-apk`).
2. Store-Listing-Texte (de/en) redigieren: Titel, Kurzbeschreibung (80 Zeichen), Langbeschreibung, Keywords; Feature-Highlights aus dem Autonomie-Programm (Design-Themes, MCP-Registry, RBAC) aufnehmen.
3. Screenshot-Set der Kernscreens erstellen und unter `docs/store-assets/` ablegen (Geruest im Repo, finale Aufnahmen vom Realgeraet).
4. Data-Safety-Erklärung aus der bestehenden Doku (`SECRETS_AND_RELEASE.md`, Backup-Verschluesselung) ableiten und als Formularantworten dokumentieren.
5. Einreichung als manuellen Handoff-Punkt vorbereiten (Upload erfolgt durch den Owner im Play Console).

## Manuelle Handoff-Punkte (bleiben Nutzeraktionen)

- Play-Store-Einreichung im Play Console durchfuehren (AAB-Upload aus Release `v1.3.0-apk`, Listing aus Sprint 83).
- APK auf einem echten Android-Gerät installieren und Workspace-Service, Cloud-Keys sowie LAN/VPN-Provider-Endpoints testen (kein `127.0.0.1` fuer Remote-Modelserver).
- Render-Konsole: Custom Domain bestätigen (84) — Persistent Disk (85) ist nicht mehr nötig (kostenlose Postgres-Persistenz aktiv); eine eventuelle Disk-Buchung bleibt optionales Upgrade.

## Mittel- und langfristige Richtung (nach Sprint 86)

- Betriebserfahrung aus dem Realgeraet-Test in die Provider-Routing- und Key-Rotationslogik zurueckfliessen lassen (Messwerte, Timeouts, Fallback-Schwellen).
- Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenfuehren.
- Verschluesselte Support- und Settings-Backups um die neuen Zustaende (Metering-Ledger, RBAC-Overrides, Design-Theme-Auswahl) erweitern, sobald diese persistiert werden.
- Transportschicht fuer die MCP-Registry (SSE/HTTP-Anbindung an `lib/mcp-registry-logic.ts`) sobald echte MCP-Server angebunden werden sollen.

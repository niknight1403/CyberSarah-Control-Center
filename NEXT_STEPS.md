# CyberSarah Control Center — Nächste geplante Schritte

Stand: 2026-09-11 (nach Release **1.3.0**, Tag `v1.3.0`)

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
| 84 | Custom Domain und Domain-Mapping abschließen (Render-Phase 5) | `app.cybersarah-ki.com` ist auf den Render-Workspace-Service gemappt; CORS-Konfiguration des Workspace-Service akzeptiert die Custom Domain; HTTPS/Redirect-Verhalten ist dokumentiert und die Verbindungspruefung der App gegen die produktive URL ist gruen. |
| 85 | Persistent Disk für den Workspace-Service | Die Render-Disk-Konfiguration (bezahlt) ist dokumentiert: Mount-Pfad, Backup-/Restore-Strategie, Migrationsplan fuer bestehende Workspace-Daten; die App verbindet sich gegen die persistente Variante und der Smoke-Test des Workspace-Service ist auf dem produktiven Pfad gruen. |
| 86 | Expo-SDK-Major-Upgrade als separater Sprint | Upgrade auf die naechste Expo-Hauptversion in einem eigenen Sprint: Abhaengigkeits-Matrix aktualisiert, NativeWind-Hauptversionswechsel geprueft (v4 ist die letzte der v4-Reihe), strengerer Typecheck bereinigt, `android/`-Ordner manuell angepasst (Quelle der Wahrheit, kein CNG), Web-Export, Server-Build und Release-AAB-Pipeline gruen. |

### Detailplanung Sprint 83 — Play-Store-Release (zuerst)

1. `PLAY_STORE_BEREITSCHAFT.md` mit der aktuellen Version 1.3.0 abgleichen (Version, Berechtigungen, AAB-Verweis auf Release `v1.3.0-apk`).
2. Store-Listing-Texte (de/en) redigieren: Titel, Kurzbeschreibung (80 Zeichen), Langbeschreibung, Keywords; Feature-Highlights aus dem Autonomie-Programm (Design-Themes, MCP-Registry, RBAC) aufnehmen.
3. Screenshot-Set der Kernscreens erstellen und unter `docs/store-assets/` ablegen (Geruest im Repo, finale Aufnahmen vom Realgeraet).
4. Data-Safety-Erklärung aus der bestehenden Doku (`SECRETS_AND_RELEASE.md`, Backup-Verschluesselung) ableiten und als Formularantworten dokumentieren.
5. Einreichung als manuellen Handoff-Punkt vorbereiten (Upload erfolgt durch den Owner im Play Console).

## Manuelle Handoff-Punkte (bleiben Nutzeraktionen)

- Play-Store-Einreichung im Play Console durchfuehren (AAB-Upload aus Release `v1.3.0-apk`, Listing aus Sprint 83).
- APK auf einem echten Android-Gerät installieren und Workspace-Service, Cloud-Keys sowie LAN/VPN-Provider-Endpoints testen (kein `127.0.0.1` fuer Remote-Modelserver).
- Render-Konsole: Custom Domain bestätigen (84) und Persistent Disk buchen (85) — die Buchung/das DNS-Handling liegt beim Owner.

## Mittel- und langfristige Richtung (nach Sprint 86)

- Betriebserfahrung aus dem Realgeraet-Test in die Provider-Routing- und Key-Rotationslogik zurueckfliessen lassen (Messwerte, Timeouts, Fallback-Schwellen).
- Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenfuehren.
- Verschluesselte Support- und Settings-Backups um die neuen Zustaende (Metering-Ledger, RBAC-Overrides, Design-Theme-Auswahl) erweitern, sobald diese persistiert werden.
- Transportschicht fuer die MCP-Registry (SSE/HTTP-Anbindung an `lib/mcp-registry-logic.ts`) sobald echte MCP-Server angebunden werden sollen.

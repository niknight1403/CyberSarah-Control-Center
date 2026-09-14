# Roadmap ab Sprint 107 — Feature-Planung nach V2.0

**Stand:** 14.09.2026, direkt nach Sprint 106 (V2.0.0-Release, signierter APK/AAB-Build, 639 Tests grün)

Diese Roadmap führt die Sprint-Nummerierung fort und setzt an drei Punkten an:

1. **Owner-Handoffs aus V2.0** abschließen und begleiten (Gerätetest, Play-Store-Einreichung).
2. **Betriebserfahrung zurückfließen lassen** — Provider-Routing, Key-Rotation, Backups, Betriebsüberblick (die mittelfristigen Punkte aus `NEXT_STEPS.md`).
3. **Agenten-Kern und Nutzersicht ausbauen** — Memory-Qualität, MCP-Transport, Revenue-OS-Integration, Onboarding/UX.

Akzeptanzkriterium je Sprint (unverändert, wie in `NEXT_STEPS.md` festgelegt): TypeScript sauber, volle Vitest-Suite grün (bekannte Ausnahme: umgebungsbedingter Sandbox-Smoke-Test, Port 18967), Server-Build erfolgreich, keine Secrets im Code, CI (`validate`, `release-audit`) grün.

---

## Phase A — Release-Veredelung und Store-Start (Sprints 107–109)

### Sprint 107 — Realgerätetest als begleiteter Handoff
**Ziel:** Die signierte v2.0.0-APK auf einem echten Android-Gerät prüfbar machen und die Ergebnisse strukturiert aufnehmen.
**Arbeiten:**
- Prüfprotokoll als Checkliste (SecureStore, Workspace-Service-Verbindung, Push-Benachrichtigungen, Kamera/Mikrofon, Offline-Verhalten, Custom-Domain-Endpoint statt `127.0.0.1`) — als `docs/GERAETETEST_v2.0.md`.
- In-App-Diagnosescreen um die Prüfpunkte ergänzen (sichtbar im Admin-Telemetrie-Bereich).
- Gefundene Befunde als Issues mit Priorität; Sprint 108 plant die Fixes ein.
**Akzeptanz:** Protokoll liegt vor, Diagnose-Screen zeigt alle Prüfpunkte, gefundene Befunde sind als Issues dokumentiert.

### Sprint 108 — Gerätetest-Befunde und Routing-Rückschluss
**Ziel:** Betriebserfahrung aus dem Realgerät in die Provider-Routing- und Key-Rotationslogik zurückfließen lassen (Messwerte, Timeouts, Fallback-Schwellen) — siehe mittelfristige Richtung in `NEXT_STEPS.md`.
**Arbeiten:**
- Befunde aus Sprint 107 fixen.
- Messwerte (Latenz, 429-Häufigkeit, Failover-Dauer) aus dem Gerätetest als Tuning-Grundlage für Cooldowns und Provider-Gewichtung aufbereiten.
**Akzeptanz:** Alle Blocker-Befunde geschlossen; Routing-Parameter sind aus Messwerten begründet (dokumentiert im Sprint-Bericht), Suite grün.

### Sprint 109 — Play-Store-Einreichung
**Ziel:** Einreichung des Release-AAB in der Play Console vorbereiten und als Owner-Handoff begleiten.
**Arbeiten:**
- `PLAY_STORE_BEREITSCHAFT.md` und `PLAY_STORE_LISTING_DE_EN.md` mit v2.0.0 (versionCode 20000) und dem Release `v2.0.0-apk` abgleichen.
- Data-Safety-Formular gegen `PLAY_STORE_DATA_SAFETY.md` final prüfen.
- Schritt-für-Schritt-Upload-Pfad (AAB aus Release, Store-Listing, Rollout als Staged Release) dokumentieren.
**Akzeptanz:** Einreichung ist ohne weitere Recherche in der Play Console möglich; Upload selbst bleibt Owner-Aktion.

---

## Phase B — Betrieb, Zuverlässigkeit und Datensicherheit (Sprints 110–112)

### Sprint 110 — Zentrale Betriebsansicht
**Erledigt (14.09.) — 671 Tests grün:** PaaS-Checks in `ops.overview` (Render-Deploy key-gated, Neon-Roundtrip-Latenz, Uptime-Wächter 24 h keyless via GitHub-Issues, Workspace-Modus), Warnstufen je Komponente mit Zeitstempel und letztem Fehlerbild in der Dashboard-Betriebswacht, Discord-Admin-Alarm bei Stufenwechsel zu kritisch (`server/ops-alerts.ts`, ohne Webhook ehrlich nur im Dashboard sichtbar). Bericht: `docs/SPRINT_110_ZENTRALE_BETRIEBSANSICHT.md`.

**Ursprünglicher Plan:** Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenführen (mittelfristiger Punkt aus `NEXT_STEPS.md`).
**Arbeiten:**
- `ops.overview` um PaaS-Checks ergänzen (Render-Deploy-Status, Neon-Postgres-Erreichbarkeit, Workspace-Service-Modus, Uptime-Wächter-Ergebnisse der letzten 24 h).
- Warnstufen (ok / Warnung / kritisch) mit Zeitstempel und letztem Fehlerbild je Komponente.
- Admin-Benachrichtigung bei Stufenwechsel zu kritisch (Discord-Webhook analog Uptime-Wächter).
**Akzeptanz:** Dashboard-Betriebswacht (Sprint 96) zeigt alle Komponenten mit Stufen; Statuswechsel triggert eine Benachrichtigung; Nicht-Admins sehen keine Telemetrie.

### Sprint 111 — Backup-Erweiterung
**Ziel:** Verschlüsselte Support- und Settings-Backups um die neuen persistierten Zustände erweitern (mittelfristiger Punkt aus `NEXT_STEPS.md`).
**Arbeiten:**
- Metering-Ledger, RBAC-Overrides und Design-Theme-Auswahl in die verschlüsselten Backups aufnehmen.
- Restore-Pfad für die neuen Zustände testen (inkl. Versionierung des Backup-Formats).
**Akzeptanz:** Backup/Restore deckt alle drei Zustände ab, round-trip-getestet; Backup-Format-Version dokumentiert.

### Sprint 112 — MCP-Transportschicht
**Ziel:** SSE/HTTP-Anbindung für die MCP-Registry (`lib/mcp-registry-logic.ts`) — sobald echte MCP-Server angebunden werden sollen (mittelfristiger Punkt aus `NEXT_STEPS.md`).
**Arbeiten:**
- Transport-Abstraktion (SSE + Streamable HTTP) mit Verbindungs-Pooling, Timeout und Reconnect.
- Ersten echten MCP-Server als Referenzanbindung konfigurierbar machen (z. B. den SEO/GA4-MCP-Server aus dem Tech-Scan, da der GA4-Sub-Agent bereits existiert — https://github.com/Akxan/google-seo-mcp).
- Key-gated Registry-Einträge analog den Business-Sub-Agenten.
**Akzeptanz:** Registry verbindet einen echten MCP-Server über SSE oder HTTP; Verbindungsabbruch wird erkannt und erholt sich; ohne konfigurierten Server bleibt die Oberfläche ehrlich leer.

---

## Phase C — Agenten-Kern und Integration (Sprints 113–116)

### Sprint 113 — Memory-Konsolidierung (Sleep-Time)
**Ziel:** Das Langzeit-Gedächtnis (Sprint 94, `agentLearnings`) von reinem Retrieval zu gepflegtem Wissen weiterentwickeln — angeregt durch den Tech-Scan-Fund `tigerless-labs/agent-memory`.
**Arbeiten:**
- Nächtlicher Konsolidierungsjob: ähnliche Learnings zusammenführen, veraltete invalidieren, Widersprüche markieren.
- Qualitätsmetriken für Retrieval (Trefferquote der Top-3-Injektion) messbar machen.
- Admin-Sicht auf den Learning-Bestand (Anzahl, letzte Konsolidierung, bereinigte Einträge).
**Akzeptanz:** Konsolidierung läuft täglich als Workflow ohne externen Key; Metriken liegen im Sprint-Bericht; Retrieval-Logik bleibt deterministisch testbar.

### Sprint 114 — Revenue-OS-Integration als Sub-Agenten-Quelle
**Ziel:** Das Schwestersystem `cybersarah-revenue-os` (29 Agenten, Stripe, Social-Posting) als Daten- und Aktionsquelle an den Master-Agenten-Daten-Hub anbinden statt als isoliertes System weiterlaufen zu lassen.
**Arbeiten:**
- Nüchternste Anbindung zuerst: Revenue-OS-Datenbank (Postgres/Neon) als read-only Sub-Agenten (Umsatz, Content-Status, Affiliate-Klicks) — analog Sprint 93.
- Später: ausgewählte Aktionen (Content-Erstellung anstoßen) als guarded Business-Tool mit Human-in-the-Loop für alles Finanzielle (Konvention aus dem Revenue-OS).
**Akzeptanz:** Dashboard zeigt Revenue-Kacheln aus echten Revenue-OS-Daten; Schreib-Tools sind bewusst nicht Teil dieses Sprints; Trennung der Secrets beider Systeme bleibt gewahrt.

### Sprint 115 — Provider-Metering-Dashboard
**Ziel:** Den Key-Pool (Sprint 78) für den Nutzer transparent machen: Verbrauch, Cooldowns, Failovers je Provider.
**Arbeiten:**
- Metering-Ledger aggregiert als Admin-Kacheln (Aufrufe, 429-Rate, aktiver Fallback-Pfad, nächste Rotation).
- Warnschwelle vor Key-Erschöpfung (z. B. 80 % Quota) als Benachrichtigung.
**Akzeptanz:** Admin sieht je Provider Verbrauch und Status ohne Log-Auswertung; Warnung wird einmalig je Schwelle getriggert; Standardnutzer sieht keine Key-Details.

### Sprint 116 — Tech-Scanner-Ableitungen
**Ziel:** Aus dem autonomen Tech-Scanner (Sprint 95) werden Vorschläge: erkannte relevante Upgrades (SDK 58, Drizzle, NativeWind) automatisch als Planungs-Issues mit Relevanzbegründung.
**Arbeiten:**
- `LATEST_TECH_SCAN.md`-Funde mit Bereich Major-Upgrade automatisch als Issue-Vorlage anlegen.
- Abhängigkeits-Matrix (siehe SDK-57-Sprint) als Datei pflegen, die der Scanner gegenprüft.
**Akzeptanz:** Ein Scan-Lauf erzeugt für jede Major-Änderung ein Issue mit Begründung; Duplikate werden erkannt.

---

## Phase D — Nutzersicht und Wachstum (ab Sprint 117, priorisierbar)

| Sprint | Ziel | Anmerkung |
|---|---|---|
| 117 | Onboarding-Verbesserung (Willkommensflow, Theme-Auswahl im ersten Start) | UI-Inspiration: liquid-glass-Welcome-Screens aus dem Tech-Scan |
| 118 | Agent-Avatar-System (prozedural animiert, React Native) | Tech-Scan-Fund `karacca/moodstone` (Relevanz 14, höchster Fund) — passt zum Living-AI-Interface (Sprint 89) |
| 119 | Offline-Pufferung des Daten-Hubs (letzte Dashboard-Daten lokal, Sync bei Reconnect) | Setzt Realgerät-Erkenntnisse aus Sprint 107 voraus |
| 120 | Support-Backup-Selbstbedienung: Export/Wiederherstellung aus der App für Endnutzer | Setzt Sprint 111 voraus |
| (flexibel) | Expo SDK 58 als eigener Sprint, sobald veröffentlicht | Konvention: Major-Upgrades nie im Fahrwasser (siehe NEXT_STEPS) |

---

## Empfohlene Reihenfolge und Begründung

- **Phase A zuerst:** Jede weitere Feature-Arbeit hat mehr Wert, wenn V2.0 auf einem echten Gerät verifiziert und im Store ist; Sprint 108 liefert die Messwerte, die Phase B/C konkret tunen.
- **Phase B danach:** Betriebsansicht und Backups sichern das, was V2.0 im Feld erlebt; MCP-Transport öffnet die nächste Integrationsachse.
- **Phase C als Kernprogramm:** Memory-Qualität, Revenue-OS-Anbindung und Metering-Transparenz machen aus dem Control Center das tatsächliche Kommandozentrum beider Systeme.
- **Phase D nach Bedarf:** UX- und Onboarding-Themen sind unabhängig von A–C und jederzeit zwischenschaltbar.

Offene Punkte, die diese Roadmap bewusst NICHT behandelt: Expo-SDK-58-Upgrade (entsteht neu nach Veröffentlichung), optional bezahlte Render-Disk (kostenlose Postgres-Persistenz ist aktiv), externe Konten für Codecov/UptimeRobot/Snyk (bleiben optionale Handoffs aus Sprint 91).

---

*Erstellt am 14.09.2026 auf Basis von `NEXT_STEPS.md`, `docs/SPRINT_97-106_V2_RELEASE_ROADMAP.md`, `docs/SPRINT_106_V2_RELEASE_REPORT.md`, `docs/research/LATEST_TECH_SCAN.md` und `todo.md`.*

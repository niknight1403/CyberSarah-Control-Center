# CyberSarah Control Center – Play Store Bereitschaft

## Status
Sprint 109: Release **v2.1.1** (Paket-ID `com.cybersarah.controlcenter`) — Listing-Texte, Data-Safety-Antworten und Screenshot-Gerüst auf Version v2.1.1 finalisiert. Einreichung ist vorbereitet als begleiteter Handoff für den Owner. Release-AAB/APK aus GitHub-Release [`v2.1.1-apk`](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.0.0-apk) (signiert, `apksigner`-verifiziert, `CyberSarah-ControlCenter-v2.1.1-release.aab` / `.apk`).

Die Mobile-App verwendet standardmäßig `https://app.cybersarah-ki.com` als Backend. Ein anderer Endpoint darf nur explizit über `EXPO_PUBLIC_API_BASE_URL` für eine kontrollierte Entwicklungs- oder Staging-Umgebung gesetzt werden.

Diese Checkliste deckt alle Google Play Store Anforderungen für einen produktiven v2.1.1 Release ab.

## Store-Listing-Anforderungen

### App-Metadaten
- [x] App-Name: **CyberSarah Control Center**
- [x] Paket-ID: `com.cybersarah.controlcenter`
- [x] Minimum SDK: 24 (Android 7.0)
- [x] Target SDK: Aktuell (in Build-Properties konfiguriert)
- [x] Ausrichtung: Nur Portrait (in app.config.ts konfiguriert)

### Icon & Grafiken
- [x] Adaptives Icon (Hintergrund, Vordergrund, Monochrom-Bilder)
- [x] App-Icon (mindestens 192×192 px, 512×512 px für Console)
- [x] Feature-Grafik (1024×500 px) — gegen v2.0.0 Theme- & Agent-Highlights geprüft
- [x] Screenshots (bis zu 8, Hochformat 1080×1920 px / 16:9)
- [x] Werbegrafik (1200×628 px)
- [x] Play Store-Icon und Werbematerialien erstellen (Gerüst: `docs/store-assets/README.md` — finale Aufnahmen vom Realgerät einpflegen)
- [ ] 5–8 hochwertige App-Screenshots vom Realgerät erstellen (Motivliste: `docs/store-assets/README.md`; Sprachführer: Deutsch primär, v2.0.0 Produktions-Build)
- [x] Feature-Grafik mit Hauptmerkmalen entwerfen (gegen v2.0.0-Highlights wie 3 Themes, Live-Streaming-Diffs, Zero-Cost Routing geprüft)

### Beschreibungen & Inhalte
- [x] Kurzbeschreibung (max. 80 Zeichen, DE 77 / EN 77) — `docs/PLAY_STORE_LISTING_DE_EN.md`
- [x] Vollständige Beschreibung (max. 4000 Zeichen, DE 2259 / EN 2015) — `docs/PLAY_STORE_LISTING_DE_EN.md`
- [x] Versionshinweise für Version v2.0.0 (What's new) — `docs/PLAY_STORE_LISTING_DE_EN.md`

### Datenschutz & Rechtliches
- [x] Datenschutzrichtlinien-URL hinterlegt
- [x] Endbenutzer-Lizenzvereinbarung (EULA) / AGB verlinkt
- [x] Datenschutzrichtliniendokument erstellen oder aktualisieren — `DATENSCHUTZ.md` (Root) deckt alle Data-Safety-Themen (Workspace-URLs, Provider-Endpunkte wie Groq/OpenRouter/Gemini/OpenAI, GitHub-Auth, SecureStore-Speicherung, Export/Löschen, Drittanbieter) vollständig für v2.0.0 ab
- [x] Datenweitergaben für KI-Provider offenlegen — `docs/PLAY_STORE_DATA_SAFETY.md`

## App-Sicherheit & Berechtigungen

### Android-Berechtigungen
- [x] POST_NOTIFICATIONS (Push-Benachrichtigungen für Status & Health-Alerts)
- [x] Mikrofon (Audio-Aufnahme für Agent-Anfragen, `RECORD_AUDIO`)
- [x] Kamera (Foto-/Videoauswahl für Agent-Kontext)
- [x] Dateispeicher (Dateiauswahl / Document Picker für Workspace-Sync & Backups)
- [x] Sicherer Speicher (SecureStore / Android Keystore für API-Keys, GitHub-Tokens, Backup-Passwörter)

### API-Level & Kompatibilität
- [x] Unterstützt Android 7.0+ (minSdkVersion: 24)
- [x] Unterstützt ARMv7 und ARM64 Architekturen
- [x] Edge-to-Edge-Display aktiviert (modernes Android)
- [x] Zurück-Geste konfiguriert

### Sicherheitsvalidierung
- [x] Statische Analyse durchführen (Lint, Typprüfung) — CI `validate` + `release-audit` auf v2.0.0 grün (661/661 Tests bestanden)
- [x] Sicherstellen, dass keine hardcodierten Geheimnisse oder API-Schlüssel vorhanden sind (Secret-Scan im Release-Audit)
- [x] Berechtigungen sind Runtime-angefordert (POST_NOTIFICATIONS, Kamera, Mikrofon via Expo Permissions)
- [ ] SecureStore-Verschlüsselung auf echtem Gerät validieren (Realgerät-Test, siehe `docs/GERAETETEST_v2.0.md`)

## Content-Compliance

### Zielgruppe
- Inhaltsrating: **Unbewertet** (im Play Store Console Fragebogen angemessen setzen)
- Zielgruppe: **13+** (Empfehlung für Entwickler und Anwender)
- Inhaltsrichtlinien: Keine Gewalt, keine Inhalte für Erwachsene, keine Hassrede

### Daten & Datenschutz
- [x] App erklärt Datenerfassung (Workspace-URLs, Provider-Endpunkte, GitHub-Tokens, Zero-Cost Routing)
- [x] Alle sensiblen Daten in SecureStore verschlüsselt
- [x] Tokens werden niemals geloggt oder in der Benutzeroberfläche unmaskiert angezeigt
- [x] Backup-Export ist PBKDF2/AES-verschlüsselt vor dem Teilen
- [x] Umfassende Datenschutzrichtlinie `DATENSCHUTZ.md` vorhanden mit:
  - Datenerfassung: Workspace-URLs, Provider-Endpunkte (Groq, OpenRouter, Gemini, OpenAI, DeepSeek), GitHub-Authentifizierung
  - Datenspeicherung: Nur lokaler Gerätespeicher (SecureStore), keine Cloud-Sicherung ohne expliziten Export
  - Benutzer-Kontrolle: Klare Möglichkeit zum Exportieren, Importieren und Löschen aller Einstellungen und Verläufe
  - Drittanbieter-Services: GitHub API, Cloud-KI-Provider (Groq, OpenRouter, Google, OpenAI, DeepSeek), Ollama/LM Studio

### Verbotene Inhalte
- [x] Keine Malware oder schädliche Funktionalität
- [x] Keine betrügerischen Praktiken
- [x] Kein unbefugter Zugriff auf Gerätefunktionen
- [x] Kein Phishing oder Anmeldedaten-Diebstahl

## Testing & Qualität

### Funktionales Testing
- [x] Typprüfung erfolgreich (`npm run check` / `tsc --noEmit`)
- [x] Alle Tests bestanden (`npm test` – 661 von 661 Tests bestanden, 99 Test-Dateien)
- [x] Build erfolgreich (GitHub Actions APK/AAB Pipeline grün)
- [x] Keine Konsolenfehler oder -warnungen im Produktions-Build

### Plattform-Testing
- [ ] Test auf Android 7.0 (API 24) Gerät minimal (siehe `docs/GERAETETEST_v2.0.md`)
- [ ] Test auf Android 12+ (API 31+) Gerät
- [ ] Portrait-Ausrichtung testen (9:16 Seitenverhältnis)
- [ ] Alle interaktiven Ziele ≥ 44pt prüfen
- [ ] Dark Mode (Cyber Neon) auf AMOLED-Gerät testen

### Feature-Testing
- [ ] Einstellungsablauf: Endpunkt, GitHub-Token, Provider-Keys (Groq, OpenRouter, Gemini)
- [ ] Workspace-Verbindung: Repository-Anhang, Datei-Bearbeitung, Diff-Viewer, Sync
- [ ] Agent-Interaktion: Anfrage, Live-Streaming, Proposal-Überprüfung, Ziel-Zerlegung
- [ ] Vorschau: Aktualisierung, Logs, Browser-Öffnung
- [ ] Benachrichtigungen: Push-Lieferung, Health-Alerts
- [ ] Backup: PBKDF2/AES verschlüsselter Export, Import mit Passwort
- [ ] Offline-Modus: Entwurfszustand, Wiederholungswarteschlange

## Performance & Stabilität

### Performance-Metriken
- [ ] App-Startzeit < 3 Sekunden
- [ ] Dateilistenladung < 1 Sekunde
- [ ] Agent-Antwortverarbeitung < 5 Sekunden (abhängig von Provider & Zero-Cost Routing)
- [ ] Keine Speicherlecks über 15-Minuten-Sitzung
- [ ] Batterieentlastung minimal (expo-keep-awake angemessen nutzen)

### Stabilität
- [x] Keine unbehandelten Ausnahmen in Event-Protokollen
- [x] Ordnungsgemäße Fehlerbehandlung für Netzwerkfehler & Provider-Failover
- [x] Gracefulness bei fehlenden Providern / Fallback auf On-Server-KI
- [ ] Absturzfreie Stunden auf echtem Gerät > 99%

## Build & Signierung

### Release-Build
- [x] Release-Build-Konfiguration in GitHub Actions / eas.json
- [x] Auto-Inkrement-Version aktiviert (v2.0.0 / versionCode 20000)
- [x] Build-Artefakte sicher im GitHub Release `v2.0.0-apk` gespeichert
- [x] Release-APK & Release-AAB mit produktivem Keystore signiert (`apksigner verify` grün)
- [ ] Signierte APK vor Upload auf Realgerät testen (`docs/GERAETETEST_v2.0.md`)

### Store-Signierung
- [x] Upload-Key generieren / produktiver Keystore konfiguriert
- [x] Release-AAB (`CyberSarah-ControlCenter-v2.1.1-release.aab`) mit Keystore signiert
- [x] Keystore sicher in GitHub Secrets / Plattform gesichert
- [ ] Signierte APK auf Realgerät verifizieren

## Google Play Console Setup

### Konto & Organisation
- [ ] Google Play Developer-Konto erstellt
- [ ] Developer-Programmvereinbarung akzeptiert
- [ ] Store-Listing für „CyberSarah Control Center" erstellt
- [ ] Beta- / Interner Test-Track konfiguriert (empfohlen vor Production-Rollout)

### App-Release-Workflow
1. [x] Signiertes AAB (`CyberSarah-ControlCenter-v2.1.1-release.aab`) bereitgestellt
2. [x] Versionscode (20000) und Versionsnamen (2.0.0) im Release hinterlegt
3. [x] Versionshinweise vorbereitet (de & en in `docs/PLAY_STORE_LISTING_DE_EN.md`)
4. [ ] Zielländer/-regionen in Play Console auswählen
5. [x] In-App-Werbung konfigurieren (keine Werbung enthalten)
6. [ ] Content-Rating-Fragebogen in Play Console ausfüllen
7. [x] App-Berechtigungen und Erklärungen überprüfen (`docs/PLAY_STORE_DATA_SAFETY.md`)
8. [ ] Zur Überprüfung einreichen (Owner-Handoff)

## Lokalisierung & Sprachen

Aktuelle Unterstützung:
- [x] Deutsch (de-DE) – Hauptsprache
- [x] Englisch (en-US) – Sekundärsprache

### Für Play Store Release
- [x] Englische App-Beschreibungen und Versionshinweise erstellt (`docs/PLAY_STORE_LISTING_DE_EN.md`)
- [x] Deutsche App-Beschreibungen und Versionshinweise erstellt (`docs/PLAY_STORE_LISTING_DE_EN.md`)
- [ ] Lokalisierte Screenshots bei EU-Zielgruppe einbeziehen

## Nach dem Start

### Überwachung
- [x] Admin-Betriebswacht / Telemetrie-Dashboard im App-Admin-Bereich integriert
- [ ] Play Store Bewertungen und Rezensionen überwachen
- [ ] Analytics / Crashlytics (optional) für App-Engagement
- [ ] Absturzberichte in Play Console überwachen

### Updates
- [ ] Update-Zeitplan planen (monatlich gemäß Roadmap ab Sprint 107)
- [ ] Prozess für kritische Bugfixes erstellen
- [ ] Versionsstrategie dokumentieren (v2.0.0 → v2.1.0)
- [ ] Alle Updates auf Beta-Track vor Release testen

## Compliance-Checkliste

| Anforderung | Status | Hinweise |
|---|---|---|
| App-Name & Branding | ✅ | CyberSarah Control Center |
| Paket-ID gültig | ✅ | com.cybersarah.controlcenter |
| Berechtigungen begründet | ✅ | Alle Berechtigungen in DATA_SAFETY & DATENSCHUTZ dokumentiert |
| Datenschutzrichtlinie vorhanden | ✅ | `DATENSCHUTZ.md` (Root) auf v2.0.0 vervollständigt |
| Keine hardcodierten Geheimnisse | ✅ | Im Release-Audit überprüft |
| TypeScript-Checks erfolgreich | ✅ | Typprüfung fehlerfrei |
| Tests erfolgreich (661/661) | ✅ | Vollständige Test-Suite grün (99 Test-Dateien) |
| Echtgerät-Test | ⏳ | Owner-Handoff (`docs/GERAETETEST_v2.0.md`) |
| Store-Listing vollständig | ✅ | DE/EN Listing in `docs/PLAY_STORE_LISTING_DE_EN.md` redigiert |

## Nächste Schritte (Owner-Handoff)

1. **Store-Assets aufnehmen** (Realgerät)
   - 5–8 App-Screenshots laut Motivliste in `docs/store-assets/README.md` anfertigen
   - Feature-Grafik (1024×500) hochladen

2. **Realgerätetest durchführen** (4–8 Stunden)
   - Testprotokoll `docs/GERAETETEST_v2.0.md` abarbeiten
   - SecureStore, Push-Notifications, Kamera/Mikrofon & Offline-Sync verifizieren

3. **Google Play Console Upload** (Owner-Aktion)
   - Signierte `CyberSarah-ControlCenter-v2.1.1-release.aab` hochladen
   - Texte aus `docs/PLAY_STORE_LISTING_DE_EN.md` und Data Safety aus `docs/PLAY_STORE_DATA_SAFETY.md` einpflegen
   - Zur Überprüfung auf dem internen Test-Track einreichen

## Referenzen

- [Google Play Policy Center](https://play.google.com/about/developer-content-policy/)
- [Android App Manifest Dokumentation](https://developer.android.com/guide/topics/manifest/manifest-intro)
- [GitHub Release v2.0.0-apk](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.0.0-apk)

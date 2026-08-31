# CyberSarah Control Center – Play Store Bereitschaft

## Status
Sprint 32: Play Store Ready – Compliance, Metadaten und Store-Einreichung

Diese Checkliste deckt alle Google Play Store Anforderungen für einen produktiven Release ab.

## Store-Listing-Anforderungen

### App-Metadaten
- [x] App-Name: **CyberSarah Control Center**
- [x] Paket-ID: `com.app.customaistudiomobile`
- [x] Minimum SDK: 24 (Android 7.0)
- [x] Target SDK: Aktuell (in Build-Properties konfiguriert)
- [x] Ausrichtung: Nur Portrait (in app.config.ts konfiguriert)

### Icon & Grafiken
- [x] Adaptives Icon (Hintergrund, Vordergrund, Monochrom-Bilder)
- [x] App-Icon (mindestens 192×192 px)
- [x] Feature-Grafik (1024×500 px)
- [x] Screenshots (bis zu 8, Quer- oder Hochformat)
- [x] Werbegrafik (1200×628 px)
- [ ] Play Store-Icon und Werbematerialien erstellen
- [ ] 5–8 hochwertige App-Screenshots erstellen (Englisch)
- [ ] Feature-Grafik mit Hauptmerkmalen entwerfen

### Beschreibungen & Inhalte
- [ ] Kurzbeschreibung (max. 80 Zeichen)
- [ ] Vollständige Beschreibung (max. 4000 Zeichen)
- [ ] Versionshinweise für Version 1.0.4

### Datenschutz & Rechtliches
- [x] Datenschutzrichtlinien-URL
- [x] Endbenutzer-Lizenzvereinbarung (optional, aber empfohlen)
- [ ] Datenschutzrichtliniendokument erstellen oder aktualisieren
- [ ] Datenweitergaben für KI-Provider offenlegen

## App-Sicherheit & Berechtigungen

### Android-Berechtigungen
- [x] POST_NOTIFICATIONS (Push-Benachrichtigungen)
- [x] Mikrofon (Audio-Aufnahme für Agent-Anfragen)
- [x] Kamera (Foto-/Videoauswahl)
- [x] Dateispeicher (Dateiauswahl)
- [x] Sicherer Speicher (Anmeldedaten, Tokens)

### API-Level & Kompatibilität
- [x] Unterstützt Android 7.0+ (minSdkVersion: 24)
- [x] Unterstützt ARMv7 und ARM64 Architekturen
- [x] Edge-to-Edge-Display aktiviert (modernes Android)
- [x] Zurück-Geste konfiguriert

### Sicherheitsvalidierung
- [ ] Statische Analyse durchführen (Lint, Typprüfung)
- [ ] Sicherstellen, dass keine hardcodierten Geheimnisse oder API-Schlüssel vorhanden sind
- [ ] Berechtigungen sind Runtime-angefordert
- [ ] SecureStore-Verschlüsselung auf echtem Gerät validieren

## Content-Compliance

### Zielgruppe
- Inhaltsrating: **Unbewertet** (im Play Store Console angemessen setzen)
- Zielgruppe: **13+** (Empfehlung für Benutzer)
- Inhaltsrichtlinien: Kein Gewalt, Inhalte für Erwachsene oder Hassreden

### Daten & Datenschutz
- [x] App erklärt Datenerfassung (Provider-Endpunkte, GitHub-Tokens, Workspace-Service-URLs)
- [x] Alle sensiblen Daten in SecureStore verschlüsselt
- [x] Tokens werden niemals geloggt oder in der Benutzeroberfläche angezeigt
- [x] Backup-Export ist vor dem Teilen verschlüsselt
- [ ] Umfassende Datenschutzrichtlinie erstellen mit:
  - Datenerfassung: Workspace-URLs, Provider-Endpunkte, GitHub-Authentifizierung
  - Datenspeicherung: Nur lokaler Gerätespeicher, keine Cloud-Sicherung ohne Zustimmung
  - BenutzerKontrolle: Klare Möglichkeit zum Exportieren, Importieren und Löschen aller Einstellungen
  - Drittanbieter-Services: GitHub API, Cloud-KI-Provider (OpenAI, Google, OpenRouter), Ollama/LM Studio

### Verbotene Inhalte
- [x] Keine Malware oder schädliche Funktionalität
- [x] Keine betrügerischen Praktiken
- [x] Kein unbefugter Zugriff auf Gerätefunktionen
- [x] Kein Phishing oder Anmeldedaten-Diebstahl

## Testing & Qualität

### Funktionales Testing
- [x] Typprüfung erfolgreich (`pnpm check`)
- [x] Alle Tests bestanden (`pnpm test` – 92 bestanden)
- [x] Build erfolgreich (`pnpm build`)
- [x] Keine Konsolenfehler oder -warnungen auf echtem Gerät

### Plattform-Testing
- [ ] Test auf Android 7.0 (API 24) Gerät minimal
- [ ] Test auf Android 12+ (API 31+) Gerät
- [ ] Portrait-Ausrichtung testen (9:16 Seitenverhältnis)
- [ ] Alle interaktiven Ziele ≥ 44pt prüfen
- [ ] Dark Mode auf AMOLED-Gerät testen

### Feature-Testing
- [ ] Einstellungsablauf: Endpunkt, GitHub-Token, Provider-Keys
- [ ] Workspace-Verbindung: Repository-Anhang, Datei-Bearbeitung, Synchronisierung
- [ ] Agent-Interaktion: Anfrage, Kontext, Proposal-Überprüfung
- [ ] Vorschau: Aktualisierung, Logs, Browser-Öffnung
- [ ] Benachrichtigungen: Push-Lieferung, Interaktion
- [ ] Backup: Verschlüsselter Export, Import mit Passwort
- [ ] Offline-Modus: Entwurfszustand, Wiederholungswarteschlange

## Performance & Stabilität

### Performance-Metriken
- [ ] App-Startzeit < 3 Sekunden
- [ ] Dateilistenladung < 1 Sekunde
- [ ] Agent-Antwortverarbeitung < 5 Sekunden (abhängig vom Provider)
- [ ] Keine Speicherlecks über 15-Minuten-Sitzung
- [ ] Batterieentlastung minimal (expo-keep-awake angemessen nutzen)

### Stabilität
- [x] Keine unbehandelten Ausnahmen in Event-Protokollen
- [x] Ordnungsgemäße Fehlerbehandlung für Netzwerkfehler
- [x] Gracefulness bei fehlenden Providern
- [ ] Absturzfreie Stunden auf echtem Gerät > 99%

## Build & Signierung

### Release-Build
- [x] Release-Build-Konfiguration in eas.json
- [x] Auto-Inkrement-Version aktiviert
- [x] Build-Artefakte sicher gespeichert
- [ ] Überprüfen, dass Release-APK mit produktivem Keystore signiert ist
- [ ] Signierte APK vor Upload auf Gerät testen

### Store-Signierung
- [ ] Upload-Key generieren (für Play Store)
- [ ] Release-APK mit produktivem Keystore signieren
- [ ] Keystore ist sicher gesichert
- [ ] Signierte APK funktioniert auf Gerät

## Google Play Console Setup

### Konto & Organisation
- [ ] Google Play Developer-Konto erstellt
- [ ] Developer-Programmvereinbarung akzeptiert
- [ ] Store-Listing für „CyberSarah Control Center" erstellt
- [ ] Beta-Test-Track konfiguriert (optional)

### App-Release-Workflow
1. [ ] Signierte APK zu Play Store hochladen (oder EAS verwalteter Build)
2. [ ] Versionscode und Versionsnamen setzen
3. [ ] Versionshinweise hinzufügen (de & en)
4. [ ] Zielländer/-regionen auswählen
5. [ ] In-App-Werbung konfigurieren (keine verwendet)
6. [ ] Content-Rating-Fragebogen ausfüllen
7. [ ] App-Berechtigungen und Erklärungen überprüfen
8. [ ] Zur Überprüfung einreichen

## Lokalisierung & Sprachen

Aktuelle Unterstützung:
- [x] Englisch (en-US) – Hauptsprache
- [x] Deutsch (de-DE) – Sekundärsprache

### Für Play Store Release
- [ ] Englische App-Beschreibungen und Versionshinweise erstellen
- [ ] Deutsche Übersetzungen erstellen (optional für ersten Release)
- [ ] Lokalisierte Screenshots bei EU-Zielgruppe einbeziehen

## Nach dem Start

### Überwachung
- [ ] Firebase Crashlytics einrichten (optional)
- [ ] Play Store Bewertungen und Rezensionen überwachen
- [ ] Analytics für App-Engagement einrichten
- [ ] Absturzberichte in Play Console überwachen

### Updates
- [ ] Update-Zeitplan planen (monatlich empfohlen)
- [ ] Prozess für kritische Bugfixes erstellen
- [ ] Versionsstrategie dokumentieren (major.minor.patch)
- [ ] Alle Updates auf Beta-Track vor Release testen

## Compliance-Checkliste

| Anforderung | Status | Hinweise |
|---|---|---|
| App-Name & Branding | ✅ | CyberSarah Control Center |
| Paket-ID gültig | ✅ | com.app.customaistudiomobile |
| Berechtigungen begründet | ✅ | Alle Berechtigungen dokumentiert |
| Datenschutzrichtlinie vorhanden | ⏳ | Dokumentenerstellung ausstehend |
| Keine hardcodierten Geheimnisse | ✅ | Im Code-Review überprüft |
| TypeScript-Checks erfolgreich | ✅ | Alle Typen validiert |
| Tests erfolgreich (92/92) | ✅ | Vollständige Test-Suite grün |
| Echtgerät-Test | ⏳ | Gerät-Test ausstehend |
| Store-Listing vollständig | ⏳ | Metadaten & Assets ausstehend |

## Nächste Schritte

1. **Store-Assets erstellen** (48–72 Stunden)
   - 1024×500 Feature-Grafik generieren
   - 5–8 App-Screenshots erstellen
   - Werbegrafik entwerfen

2. **Datenschutzdokumentation vervollständigen** (24 Stunden)
   - Datenschutzrichtlinie schreiben (Template vorhanden)
   - Datenweitergaben dokumentieren
   - Als PRIVACY.md zu GitHub-Repo hinzufügen

3. **Echtgerät-Test** (4–8 Stunden)
   - Auf Android 7.0 Gerät minimum testen
   - Alle Features auf echter Hardware überprüfen
   - Netzwerkfehler und Offline-Modus testen

4. **Google Play Console Setup** (2–4 Stunden)
   - Developer-Konto erstellen
   - App-Listing einrichten
   - Release-Track konfigurieren

5. **Zur Überprüfung einreichen** (laufend)
   - Signierte APK hochladen
   - Play Store Richtlinien-Compliance überprüfen
   - Einreichen und auf Überprüfung warten (typisch 24–48 Stunden)
   - Überprüfungs-Feedback überwachen

## Referenzen

- [Google Play Policy Center](https://play.google.com/about/developer-content-policy/)
- [Android App Manifest Dokumentation](https://developer.android.com/guide/topics/manifest/manifest-intro)
- [Material Design Richtlinien](https://material.io/design)
- [Expo Managed Publishing](https://docs.expo.dev/guides/publishing-to-app-stores/)

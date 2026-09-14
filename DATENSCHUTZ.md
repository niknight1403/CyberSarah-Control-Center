# Datenschutzrichtlinie – CyberSarah Control Center

**Zuletzt aktualisiert:** 14. September 2026 (Version 2.0.0)

## Überblick

CyberSarah Control Center ist eine mobile Entwicklungsarbeitsbereich-Anwendung, mit der Sie Code-Repositories verwalten, Vorschau-Umgebungen ausführen und mit KI-Agenten interagieren können. Diese Datenschutzrichtlinie erklärt, wie wir Ihre Daten behandeln.

## Daten, die wir erfassen

### 1. Konfiguration & Anmeldedaten (Nur lokaler Speicher)

Wenn Sie CyberSarah Control Center konfigurieren, geben Sie an:
- **Workspace-Service-URL** – der Endpunkt Ihres selbst gehosteten Workspace-Service (z. B. auf Render)
- **GitHub-Repository-URL** – das Repository, das Sie verwalten möchten
- **GitHub-Authentifizierungs-Token** – für Repository-Zugriff (sicher gespeichert)
- **KI-Provider-API-Keys** – für Groq, OpenRouter, Google Gemini, OpenAI oder DeepSeek (sicher gespeichert)
- **Lokale KI-Endpunkte** – URLs für Ollama oder LM Studio in Ihrem Netzwerk

**Diese Werte werden ausschließlich auf Ihrem Gerät gespeichert** mit sicherer Plattformspeicherung (iOS Keychain, Android SecureStore). Wir geben diese Informationen niemals an Drittanbieter-Services weiter. Sie können diese Einstellungen jederzeit exportieren, importieren oder löschen.

### 2. Workspace-Inhalte

Dateien, die Sie in der App bearbeiten, und Code-Änderungen werden gespeichert:
- **Lokal auf Ihrem Gerät** bis Sie explizit zu einem Remote-Repository pushen
- **Auf Ihrem selbst gehosteten Workspace-Service** (Sie kontrollieren die Infrastruktur)
- **In Ihrem GitHub-Repository** (unterliegt der GitHub-Datenschutzrichtlinie)

Wir greifen nicht auf diese Inhalte zu, loggen sie nicht und speichern sie nicht auf unseren Servern.

### 3. KI-Agent-Interaktionen

Wenn Sie den KI-Agenten verwenden:
- Ihre Eingabeaufforderung und jeder angehängte Datei-Kontext werden an Ihren konfigurierten KI-Provider (Groq, OpenRouter, Google Gemini, OpenAI, DeepSeek oder lokales Ollama/LM Studio) gesendet
- Die Datenschutzrichtlinien des jeweiligen KI-Providers gelten für deren Datenbehandlung
- Bei der Nutzung von Zero-Cost Routing werden bevorzugt kostenfreie Provider-Endpunkte genutzt, ohne dass Anmeldedaten im Klartext weitergegeben werden
- Wir loggen oder speichern diese Interaktionen nicht in CyberSarah Control Center
- Sie können Ihren Entwicklungs-Chat-Verlauf jederzeit aus der App löschen

### 4. Push-Benachrichtigungen

Mit Ihrer Berechtigung (`POST_NOTIFICATIONS`) senden wir Benachrichtigungen für:
- Repository-Statusänderungen (angehängt, getrennt, Fehler)
- Workspace-Service-Gesundheitsereignisse (verbunden, getrennt)
- KI-Agent-Anfragestatus (ausstehend, abgeschlossen, fehlgeschlagen)
- Health-Alerts und Telemetrie-Warnungen aus der Betriebswacht

Benachrichtigungen werden über Expo/Firebase Cloud Messaging zugestellt und erfordern keine externe Speicherung persönlicher Protokolle.

### 5. Geräte-Berechtigungen

Die App fordert die folgenden Berechtigungen nur bei Bedarf an:
- **Mikrofon (`RECORD_AUDIO`)** – für Spracheingabe im KI-Agenten (optional)
- **Kamera & Fotogalerie** – zum Anhängen von Bildern an Agent-Anfragen (optional)
- **Dateispeicher** – für Dateiauswahl und verschlüsselte Backup-Exporte (optional)
- **Benachrichtigungen (`POST_NOTIFICATIONS`)** – für Statusmeldungen (optional)

Alle Berechtigungsanfragen werden vom Benutzer initiiert und können jederzeit in den Geräteeinstellungen widerrufen werden.

## Daten, die wir NICHT erfassen

Wir **erfassen NICHT**:
- Analytics oder Nutzungstelemetrie an externe Werbenetzwerke
- Ihr persönliches Surfverhalten
- Sitzungsprotokolle oder unmasked Tokens
- Verkaufen oder Weitergabe Ihrer Daten an Dritte
- Verwendung Ihrer Daten für Werbung oder Marketing

## Datenspeicherung

- **Lokale App-Daten** (Einstellungen, Anmeldedaten in SecureStore, Workspace-Status) – gespeichert bis Sie die App löschen oder App-Daten löschen
- **GitHub-Repository** – unterliegt Ihren GitHub- und Repository-Einstellungen
- **KI-Provider-Interaktionen** – unterliegen der Aufbewahrungsrichtlinie Ihres gewählten KI-Providers

Sie können App-Einstellungen und Chat-Verlauf jederzeit manuell exportieren, importieren oder löschen.

## Drittanbieter-Services

CyberSarah Control Center integriert sich mit den folgenden Services (nur wenn Sie diese explizit konfigurieren):

### GitHub
- **Was wird geteilt:** Ihre konfigurierte Repository-URL und Ihr GitHub-Authentifizierungs-Token (für Zugriff)
- **Wann:** Nur wenn Sie ein Repository anhängen oder Git-Operationen durchführen
- **Datenschutz:** Unterliegt der [GitHub-Datenschutzrichtlinie](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)

### KI-Provider (Optional & Zero-Cost Routing)

Je nach Ihrer Konfiguration und Routing-Einstellung:

#### Groq & OpenRouter
- **Was wird geteilt:** Ihr API-Schlüssel (auf Gerät verschlüsselt in SecureStore) und Ihre Anfragen/Kontext
- **Wann:** Wenn Sie eine Anfrage an den KI-Agenten senden (z. B. im Rahmen des Zero-Cost Routings)
- **Datenschutz:** Unterliegt der [Groq-Datenschutzrichtlinie](https://groq.com/privacy) bzw. [OpenRouter-Datenschutzrichtlinie](https://openrouter.ai/privacy)

#### Google Gemini
- **Was wird geteilt:** Ihr API-Schlüssel (auf Gerät verschlüsselt) und Anfragen
- **Wann:** Wenn Sie eine Anfrage an den KI-Agenten senden (z. B. im Failover-Fall)
- **Datenschutz:** Unterliegt der [Google-Datenschutzrichtlinie](https://policies.google.com/privacy)

#### OpenAI & DeepSeek
- **Was wird geteilt:** Ihr API-Schlüssel (auf Gerät verschlüsselt) und Anfragen
- **Wann:** Wenn Sie eine Anfrage an den KI-Agenten senden
- **Datenschutz:** Unterliegt der [OpenAI-Datenschutzrichtlinie](https://openai.com/privacy) bzw. [DeepSeek-Datenschutzrichtlinie](https://www.deepseek.com/privacy)

#### Ollama / LM Studio (Lokal)
- **Was wird geteilt:** Nur Ihre Anfragen (an Ihr lokales Netzwerk-Gerät gesendet)
- **Wann:** Wenn Sie eine Anfrage an den KI-Agenten senden
- **Datenschutz:** Keine Daten verlassen Ihr Gerät oder lokales Netzwerk

### Workspace-Service
Der Workspace-Service (den Sie selbst hosten) verwaltet:
- Repository-Klonen und Git-Operationen
- Dateisystem-Zugriff und Vorschau-Laufzeit
- Prozessausführung für Entwicklungsserver

Daten, die an den Workspace-Service gesendet werden, sind begrenzt auf:
- Repository-URL und Branch-Informationen
- Dateipfade und Inhalte, die Sie explizit bearbeiten
- Git-Commit-Meldungen und Push-Operationen

Der Workspace-Service teilt Daten mit CyberSarah Control Center nur auf Ihre explizite Anforderung.

## Sicherheit

### Lokale Verschlüsselung
- Alle Anmeldedaten (GitHub-Tokens, API-Schlüssel, Passwörter) werden mit Plattform-Nativ-Sicherspeicher (Android Keystore / SecureStore) verschlüsselt
- Tokens werden niemals in der App angezeigt oder geloggt
- Backup-Exporte (Settings & Support) sind Ende-zu-Ende mit PBKDF2/AES und benutzerdefiniertem Passwort verschlüsselt

### Netzwerk-Sicherheit
- Alle Kommunikation mit Workspace-Services verwendet HTTPS/TLS
- API-Schlüssel und Tokens werden nur an ihre jeweiligen Provider übertragen
- Keine Abfangung oder Man-in-the-Middle-Proxys; private IP-Adressen ohne Zertifikat werden abgewiesen

### App-Sicherheit
- TypeScript-Typprüfung stellt Code-Sicherheit sicher
- Automatisierte Tests (661 Tests grün) validieren Berechtigungen und Datenisolation
- Regelmäßige Sicherheitsprüfungen von Abhängigkeiten und Secret-Scans im Release-Audit

## Ihre Datenschutzrechte

Sie haben das Recht zu:
- **Zugreifen** – alle in der App gespeicherten Daten ansehen (Export-Funktion)
- **Korrigieren** – Ihre Einstellungen und Konfiguration ändern
- **Löschen** – alle App-Daten durch Löschen von App-Daten oder Deinstallation entfernen
- **Widerrufen** – jede optionale Berechtigung oder Integration deaktivieren
- **Portieren** – Ihre Einstellungen und Chat-Verlauf in Standardformaten (PBKDF2/AES verschlüsseltes Backup) exportieren

Um diese Rechte auszuüben, nutzen Sie den Einstellungsbildschirm zur Verwaltung von Anmeldedaten und zum Exportieren von Daten, oder kontaktieren Sie den Support.

## Datenschutz von Kindern

CyberSarah Control Center ist für **Entwickler und Anwender ab 13 Jahren** vorgesehen. Wir erfassen nicht wissentlich Informationen von Kindern unter 13 Jahren. Wenn wir feststellen, dass wir Informationen von Kindern unter 13 Jahren ohne überprüfbare elterliche Zustimmung erfasst haben, werden wir diese Informationen löschen.

## Änderungen dieser Datenschutzrichtlinie

Wir können diese Datenschutzrichtlinie von Zeit zu Zeit aktualisieren. Wir werden Sie über wesentliche Änderungen durch die App oder dieses Dokument benachrichtigen. Die fortgesetzte Nutzung der App nach Änderungen gilt als Akzeptanz der aktualisierten Richtlinie.

## Kontakt

Bei datenschutzrelevanten Fragen oder Datenanfragen kontaktieren Sie:
- **Repository-Issues:** [GitHub Issues](https://github.com/niknight1403/CyberSarah-Control-Center/issues)
- **Direkter Kontakt:** Siehe Repository-README

## Zusammenfassung

**CyberSarah Control Center respektiert Ihren Datenschutz:**
- Ihre Anmeldedaten sind auf Ihrem Gerät in SecureStore verschlüsselt
- Ihr Code und Ihre Unterhaltungen unterliegen Ihrer Kontrolle
- Wir erfassen minimale Daten und geben sie niemals an Dritte weiter
- Sie können App-Daten jederzeit exportieren, ändern oder löschen

# Play Store — Data Safety Formular (Antworten)

Stand: 14.09.2026 — Sprint 109 (Release **v2.0.0**, versionCode 20000, Paket-ID `com.cybersarah.controlcenter`)

Antwortsatz für den Data-Safety-Bereich der Play Console. Grundlage: `DATENSCHUTZ.md` (Root), `docs/SECRETS_AND_RELEASE.md`, SecureStore-Verschlüsselung (`lib/secure-session-store.ts`), PBKDF2/AES Backup-Verschlüsselung (`lib/settings-backup.ts`, `lib/support-backup.ts`) und die Dashboard-Betriebswacht. Jede Antwort ist als Formularfeld-Antwort formuliert.

## Grundsätzliche Fragen

| Frage | Antwort |
|---|---|
| Sammelt die App Daten? | **Ja** |
| Werden Daten verschlüsselt übertragen? | **Ja** (HTTPS/TLS zu konfigurierten Endpoints; eigene Endpoints müssen HTTPS sein, private Adressen werden abgewiesen — vgl. Endpoint-Validierung in der MCP-Registry) |
| Bietet die App eine Löschfunktion für Nutzerdaten? | **Ja** (Support-/Einstellungs-Backups löschbar; lokale Sitzungsdaten über SecureStore löschbar; Server-Accountlöschung über die Plattform) |

## Hardware-Berechtigungen & Datenzuordnung

| Berechtigung | Zweck / Verwendung | Datensicherheit |
|---|---|---|
| `POST_NOTIFICATIONS` | Push-Benachrichtigungen für Status, Background-Tasks & Health-Alerts | Expo/FCM Push-Token; keine Inhaltsübertragung an Werbenetzwerke |
| `RECORD_AUDIO` (Mikrofon) | Audio-Aufnahme für Spracheingaben im KI-Agenten | Verarbeitung ausschließlich zur Spracherfassung der jeweiligen Anfrage |
| `CAMERA` / Fotos | Bildaufnahme für Agent-Anfragen & Kontext-Anhänge | Verarbeitet lokal und übertragen als Anfragekontext an gewählten Provider |
| Dateispeicher (`READ/WRITE_EXTERNAL_STORAGE` / Scoped Storage) | Dateiauswahl für Workspace-Sync, Import & PBKDF2/AES verschlüsselten Backup-Export | Verbleibt lokal auf Gerät / Workspace-Server |
| `SecureStore` (Android Keystore) | Verschlüsselte Speicherung von API-Keys (Groq, OpenRouter, Gemini, OpenAI, DeepSeek), GitHub-Tokens und Backup-Passwörtern | Nativ im Android Keystore verschlüsselt, nicht im Klartext lesbar |

## Datenerhebungs-Matrix

### 1. Persönliche Informationen — E-Mail-Adresse
- **Erhoben?** Ja (Account-Erstellung über Workspace-Server; OAuth via GitHub)
- **Zweck:** Account-Verwaltung (Account management)
- **Verarbeitung:** Nutzerdaten werden nicht an Dritte weitergegeben; keine Werbe- oder Analyseverwendung
- **Löschbar?** Ja
- **Verschlüsselt in Transit?** Ja (HTTPS/TLS)
- **Verschlüsselt im Ruhezustand?** Ja (Server: Neon-Postgres; lokal: SecureStore/Android Keystore)

### 2. Finanzinformationen — Käufe
- **Erhoben?** Ja (bei Abo-Abschluss über Stripe Checkout; **keine** Kreditkartendaten in der App — Abwicklung ausschließlich Stripe)
- **Zweck:** App-Funktionalität (Abonnement-Verwaltung, Nutzungsmetering, RBAC-Tiers Free bis Elite)
- **Verarbeitung:** Nutzer-ID und Abo-Status werden verarbeitet; Stripe verarbeitet die Zahlung
- **Löschbar?** Ja (Abo kündbar; Account löschbar)

### 3. App-Aktivität — Chat-/Entwicklungsverläufe, Agent-Ziele
- **Erhoben?** Ja (Entwicklungschats, Live-Streaming-Interaktionen, Ziel-Zerlegungen, Aktionshistorie)
- **Zweck:** App-Funktionalität; Verläufe werden beim Überschreiten konfigurierbarer Grenzen deterministisch komprimiert
- **Verarbeitung:** Keine Weitergabe an Dritte; KI-Provider (Groq, OpenRouter, Gemini, OpenAI, DeepSeek) erhalten nur die für die jeweilige Anfrage nötigen Kontexte (Zero-Cost Routing / Nutzer-Keys)
- **Löschbar?** Ja (Chat-Verlauf löschbar)
- **Verschlüsselt in Transit?** Ja; im Ruhezustand verschlüsselt (SecureStore)

### 4. App-Interaktionen / Diagnose — Audit- und Latenzdaten
- **Erhoben?** Ja (externer Aktions-Audit mit tokenfreier Redaktion, Provider-Latenzmessungen fürs Smart Routing, Telemetrie-Dashboard)
- **Zweck:** App-Funktionalität (Zero-Cost Routing, Failover, Transparenz, Betriebswacht)
- **Verarbeitung:** Keine Weitergabe; Audit-Exporte sind redigiert (Token-frei)
- **Löschbar?** Ja (Audit-Rotation mit konfigurierbarer Aufbewahrung)

### 5. Dateien — Projekte, Medien
- **Erhoben?** Ja (Projekt-Uploads, Foto-/Video- und Dateiauswahl zur Verarbeitung)
- **Zweck:** App-Funktionalität (Workspace-Sync, Agent-Aufgaben, Code-Diffs)
- **Verarbeitung:** Sync nur zum konfigurierten Workspace-Server des Nutzers
- **Löschbar?** Ja

### 6. Geräte-/App-IDs — Push-Benachrichtigungs-Token
- **Erhoben?** Ja (Expo-Push-Token für Benachrichtigungen)
- **Zweck:** App-Funktionalität (Benachrichtigungen)
- **Verarbeitung:** Keine Weitergabe außer Push-Dienst (Expo/Firebase Cloud Messaging)
- **Löschbar?** Ja

## Explizite „Nicht erhoben"-Aussagen

- **Keine** Standortdaten (App fragt keine Location-Permission an)
- **Keine** Web-Browsing-Historie
- **Keine** Werbe-/Marketing-Daten, keine Weitergabe an Werbenetzwerke
- **Kein Verkauf** von Daten an Dritte
- **Keine Kreditkartendaten** in der App (Stripe-Hosted-Checkout)

## Sicherheitsbezogene Antworten (App-Content-Bereich)

| Frage | Antwort |
|---|---|
| Verschlüsselung sensibler Daten im Ruhezustand? | **Ja** — SecureStore (Android Keystore), verschlüsselte Support-/Settings-Export-Backups (PBKDF2/AES) |
| Nutzer können Daten anfordern/löschen? | **Ja** (Export & Löschung direkt über die App-Einstellungen) |
| Sicherheitserklärung (URL) | Datenschutzrichtlinien-URL `DATENSCHUTZ.md` der Plattform hinterlegen |

## Verantwortlichkeit bei KI-Providern & Zero-Cost Routing

Die App verarbeitet Anfragen über **Zero-Cost-Provider-Routing** (Groq, OpenRouter, Gemini-Failover) sowie vom Nutzer konfigurierte API-Keys (OpenAI, DeepSeek, eigene Endpoints). Schlüssel liegen ausschließlich verschlüsselt im Gerätespeicher (`SecureStore`), verlassen das Gerät nie im Klartext und werden automatisch bei Erschöpfung/Rate-Limits rotiert (Key-Pool, Sprint 78). Eine Offenlegung der Datenweitergabe an den jeweiligen Provider ist Teil der obenstehenden Matrix (Kategorie 3) und in `DATENSCHUTZ.md` verankert.

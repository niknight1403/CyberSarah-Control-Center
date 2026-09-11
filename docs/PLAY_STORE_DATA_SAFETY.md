# Play Store — Data Safety Formular (Antworten)

Stand: 11.09.2026 — Sprint 83 (Release 1.3.0)

Antwortsatz für den Data-Safety-Bereich der Play Console. Grundlage: `docs/SECRETS_AND_RELEASE.md`, SecureStore-Verschlüsselung (`lib/secure-session-store.ts`), Backup-Verschlüsselung (`lib/settings-backup.ts`, `lib/support-backup.ts`) und der externe Audit-Service. Jede Antwort ist als Formularfeld-Antwort formuliert.

## Grundsätzliche Fragen

| Frage | Antwort |
|---|---|
| Sammelt die App Daten? | **Ja** |
| Werden Daten verschlüsselt übertragen? | **Ja** (HTTPS/TLS zu konfigurierten Endpoints; eigene Endpoints müssen HTTPS sein, private Adressen werden abgewiesen — vgl. Endpoint-Validierung in der MCP-Registry) |
| Bietet die App eine Löschfunktion für Nutzerdaten? | **Ja** (Support-/Einstellungs-Backups löschbar; lokale Sitzungsdaten über SecureStore löschbar; Server-Accountlöschung über die Plattform) |

## Datenerhebungs-Matrix

### 1. Persönliche Informationen — E-Mail-Adresse
- **Erhoben?** Ja (Account-Erstellung über Workspace-Server; OAuth via GitHub)
- **Zweck:** Account-Verwaltung (Account management)
- **Verarbeitung:** Nutzerdaten werden nicht an Dritte weitergegeben; keine Werbe- oder Analyseverwendung
- **Löschbar?** Ja
- **Verschlüsselt in Transit?** Ja
- **Verschlüsselt im Ruhezustand?** Ja (Server: Neon-Postgres; lokal: SecureStore/Android Keystore)

### 2. Finanzinformationen — Käufe
- **Erhoben?** Ja (bei Abo-Abschluss über Stripe Checkout; **keine** Kreditkartendaten in der App — Abwicklung ausschließlich Stripe)
- **Zweck:** App-Funktionalität (Abonnement-Verwaltung, Nutzungsmetering)
- **Verarbeitung:** Nutzer-ID und Abo-Status werden verarbeitet; Stripe verarbeitet die Zahlung
- **Löschbar?** Ja (Abo kündbar; Account löschbar)

### 3. App-Aktivität — Chat-/Entwicklungsverläufe, Agent-Ziele
- **Erhoben?** Ja (Entwicklungschats, Ziel-Zerlegungen, Aktionshistorie)
- **Zweck:** App-Funktionalität; Verläufe werden beim Überschreiten konfigurierbarer Grenzen deterministisch komprimiert
- **Verarbeitung:** Keine Weitergabe an Dritte; KI-Provider erhalten nur die für die jeweilige Anfrage nötigen Kontexte (Nutzer bringt eigene Keys mit)
- **Löschbar?** Ja (Chat-Verlauf löschbar)
- **Verschlüsselt in Transit?** Ja; im Ruhezustand verschlüsselt (SecureStore)

### 4. App-Interaktionen / Diagnose — Audit- und Latenzdaten
- **Erhoben?** Ja (externer Aktions-Audit mit tokenfreier Redaktion, Provider-Latenzmessungen fürs Routing)
- **Zweck:** App-Funktionalität (Routing, Fallback, Transparenz)
- **Verarbeitung:** Keine Weitergabe; Audit-Exporte sind redigiert (Token-frei)
- **Löschbar?** Ja (Audit-Rotation mit konfigurierbarer Aufbewahrung)

### 5. Dateien — Projekte, Medien
- **Erhoben?** Ja (Projekt-Uploads, Foto-/Video- und Dateiauswahl zur Verarbeitung)
- **Zweck:** App-Funktionalität (Workspace-Sync, Agent-Aufgaben)
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
- **Keine Verkauf** von Daten an Dritte
- **Keine Credit-Kartendaten** in der App (Stripe-Hosted-Checkout)

## Sicherheitsbezogene Antworten (App-Content-Bereich)

| Frage | Antwort |
|---|---|
| Verschlüsselung sensibler Daten im Ruhezustand? | **Ja** — SecureStore (Android Keystore), verschlüsselte Export-Backups (PBKDF2/AES) |
| Nutzer können Daten anfordern/löschen? | **Ja** |
| Sicherheitserklärung (URL) | Datenschutzrichtlinien-URL der Plattform hinterlegen (siehe Play-Store-Bereitschaft, Abschnitt „Datenschutzrichtlinien-URL") |

## Verantwortlichkeit bei KI-Providern

Die App verarbeitet Anfragen über **vom Nutzer konfigurierte** API-Keys (OpenAI, Anthropic, Google Gemini, DeepSeek, eigene Endpoints). Schlüssel liegen ausschließlich verschlüsselt im Gerätespeicher (`SecureStore`), verlassen das Gerät nie im Klartext und werden automatisch bei Erschöpfung/Rate-Limits rotiert (Key-Pool, Sprint 78). Eine Offenlegung der Datenweitergabe an den jeweiligen Provider ist Teil der obenstehenden Matrix (Kategorie 3).

# Gerätetest-Protokoll v2.0.0 — Sprint 107

**Zweck:** Begleiteter Owner-Handoff aus Sprint 106. Die signierte Release-APK wird auf einem echten Android-Gerät geprüft, bevor die Play-Store-Einreichung (Sprint 109) erfolgt.

**Testobjekt:** `CyberSarah-ControlCenter-v2.0.0-release.apk` aus dem Release [v2.0.0-apk](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.0.0-apk) (versionCode 20000, `com.cybersarah.controlcenter`).

**Durchführung:** Owner auf dem Gerät · Ergebnisse in die Tabelle „Befunde“ eintragen · Blocker sofort als GitHub-Issue mit Label `device-test` anlegen.

---

## Vorbereitung

- [ ] Android-Gerät mit Android 10+ (minSdk lt. `android/build.gradle` prüfen), ausreichend Akku
- [ ] APK von der Release-Seite herunterladen und installieren („Unbekannte Quellen“ temporär erlauben)
- [ ] Gerät im gleichen Netzwerk wie der Workspace-Service **oder** Mobilfunk — Remote-Modelserver dürfen nicht über `127.0.0.1` erreichbar sein
- [ ] Zugangsdaten: Admin-Account und Standardnutzer-Account (für RBAC-Prüfung)

## 1. Installation & erster Start

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 1.1 | APK-Installation | Läuft ohne Fehler, keine Warnung zu beschädigter Signatur | ☐ | |
| 1.2 | Erster App-Start | Splash → Login/Chat ohne Absturz (< 5 s auf Mittelklasse-Gerät) | ☐ | |
| 1.3 | Productive Endpoint | App verbindet mit `https://app.cybersarah-ki.com` (kein localhost-Fallback sichtbar) | ☐ | |

## 2. SecureStore & Authentifizierung

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 2.1 | Login | Login mit echten Zugangsdaten erfolgreich, Token in SecureStore (kein Klartext in AsyncStorage) | ☐ | |
| 2.2 | Token-Überleben | App komplett schließen und neu öffnen → Session bleibt bestehen | ☐ | |
| 2.3 | App-Neustart nach Abmelden | Logout entfernt Session, erneuter Login funktioniert | ☐ | |

## 3. Workspace-Service-Verbindung

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 3.1 | Health des Workspace-Service | Diagnose zeigt `mode: "postgres"` (Persistenz aktiv) | ☐ | |
| 3.2 | WIP-Dateien überleben Re-Deploy | Angelegte Datei bleibt nach Workspace-Neustart vorhanden | ☐ | |
| 3.3 | Remote-Modelserver | LAN/VPN-Provider-Endpoints über echte Adresse erreichbar (nicht `127.0.0.1`) | ☐ | |

## 4. Master-Agent & KI

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 4.1 | Echter Chat-Turn | Antwort über Managed-Provider-Kette (Forge > Gemini > OpenAI), Modell in Diagnose sichtbar | ☐ | |
| 4.2 | Key-Rotation/Failover | Bei 429 sichtbarer Failover ohne Nutzerfehler; Cooldown danach nicht sofort wieder derselbe Key | ☐ | |
| 4.3 | Business-Tools | Mind. ein Nur-Lese-Tool (z. B. Analytics/CRM) ehrlich „nicht konfiguriert“, wenn kein Key gesetzt | ☐ | |
| 4.4 | Guardrails | Finanz-/Schreib-Tools fragen Human-in-the-Loop nach | ☐ | |

## 5. Benachrichtigungen, Kamera, Mikrofon

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 5.1 | Push-Benachrichtigungen | Berechtigungsdialog erscheint, Test-Benachrichtigung kommt an | ☐ | |
| 5.2 | Kamera | Kamera-Feature startet ohne Crash, Berechtigung wird korrekt angefragt | ☐ | |
| 5.3 | Mikrofon | Sprach-/Audiofeature startet ohne Crash, Berechtigung wird korrekt angefragt | ☐ | |

## 6. Offline-Verhalten

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 6.1 | Offline-Start | App startet offline ohne Crash, zeigt klaren Offline-Hinweis (kein Hängen im Spinner) | ☐ | |
| 6.2 | Offline → Online | Nach WLAN-zurück: Anmeldung/Chat erholen sich ohne App-Neustart | ☐ | |

## 7. RBAC & Dashboard

| Nr. | Prüfpunkt | Erwartung | Status | Notiz |
|---|---|---|---|---|
| 7.1 | Standardnutzer | Kein Admin-Telemetrie sichtbar (keine Betriebswacht-/Metering-Daten) | ☐ | |
| 7.2 | Admin | Dashboard-Betriebswacht (Sprint 96) zeigt Gesamtstatus und Einzelchecks | ☐ | |
| 7.3 | Admin-Elite-Routing | Als Admin: Fähigkeits-Top-Provider wird bevorzugt (Modell-Anzeige prüfen) | ☐ | |

## Befunde

| Nr. | Beschreibung | Schwere (Blocker/Minor) | Issue | Status |
|---|---|---|---|---|
| | | | | |

**Messwerte für Sprint 108 (Routing-Tuning) mitschreiben:** grobe Antwortlatenz je Provider, sichtbare Failover-Situationen (Provider A → B), Häufigkeit von 429-Fehlern während der Tests.

---

*Teil von `docs/ROADMAP_AB_SPRINT_107.md` (Sprint 107). Ergänzt die „Verbleibenden Owner-Handoffs“ aus `docs/SPRINT_106_V2_RELEASE_REPORT.md`.*

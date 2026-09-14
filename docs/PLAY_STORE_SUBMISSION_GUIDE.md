# Play-Store-Einreichung — Schritt-für-Schritt-Handoff für den Owner

Stand: 14.09.2026 — Release **v1.3.5** (Paket-ID `com.app.customaistudiomobile`)

Dieses Dokument ist die Anleitung für die Einreichung in der Google Play Console. Alle Vorarbeiten (Listing-Texte, Data-Safety-Antworten, signierte Artefakte) liegen abgeschlossen vor. Der Upload selbst bleibt bewusst Owner-Handoff.

## Benötigte Dateien

Aus dem GitHub-Release **`v1.3.5-apk`** (https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v1.3.5-apk):

| Datei | Zweck |
|---|---|
| `CyberSarah-ControlCenter-v1.3.5-release.aab` | **Upload für Google Play** — signiert (jarsigner-verifiziert), R8-konforme Bundle-Auslieferung über Play App Signing |
| `CyberSarah-ControlCenter-v1.3.5-release.apk` | Direktinstallation zum Selbsttest (gleiche Signatur wie das AAB) |
| `CyberSarah-ControlCenter-v1.3.5-debug.apk` | Nur Debug-Zwecke — NICHT einreichen

Die Pipeline (`.github/workflows/build-apk.yml`, Workflow „Build Android APK", `version_name` = 1.3.5) baut Web-Export → Capacitor-Sync → signierte APK + signiertes AAB in einem Durchlauf und lädt alles in denselben Release hoch. Ein Neuaufbau jederzeit per Workflow-Dispatch möglich.

## Vorbereitung (einmalig pro Play-Console-Konto)

1. **Play Console** öffnen (https://play.google.com/console) — persönliches Entwicklerkonto erforderlich (falls noch nicht geschehen: einmalige Registrierungsgebühr, Identitätsprüfung).
2. **Play App Signing**: Bei der ersten AAB-Einreichung bietet Google an, einen App-Signing-Key von Google verwalten zu lassen — empfohlen: „Export and upload a key from Java keystore" wählen und den Upload-Key (der Release-Keystore aus den GitHub-Secrets `ANDROID_KEYSTORE_*`) verwenden. Danach signiert Google die Auslieferung; Updates werden mit dem Upload-Key geprüft.
3. **Paket-ID bestätigen**: `com.app.customaistudiomobile` — nach der ersten Einreichung nicht mehr änderbar.

## Schritt für Schritt (App anlegen)

1. **App erstellen**: „Alle Apps" → „App erstellen" → App-Name `CyberSarah Control Center`, Standardsprache Deutsch, App/Kostenlos.
2. **App-Release**: Interner Test oder geschlossener Test → „Neuen Release erstellen" → AAB `CyberSarah-ControlCenter-v1.3.5-release.aab` hochladen → Release-Notes aus `docs/PLAY_STORE_LISTING_DE_EN.md` (Abschnitt „Versionshinweise 1.3.5", DE + EN) übernehmen.
3. **Store-Listing** („Haupt-Store-Listing"): Texte aus `docs/PLAY_STORE_LISTING_DE_EN.md` übernehmen — App-Name, Kurzbeschreibung (79/80 Zeichen), Langbeschreibung (DE primär, EN als zusätzliche Sprache). Grafiken: Icon + Feature-Grafik liegen im Projekt bereit; finale Screenshots vom Realgerät unter `docs/store-assets/` ergänzen (Motivliste: `docs/store-assets/README.md`).
4. **Data Safety**: Das Formular nach `docs/PLAY_STORE_DATA_SAFETY.md` ausfüllen (Antwortsatz liegt dort vollständig vor).
5. **Inhalt und Zielgruppe**: Zielgruppe 13+, Inhaltsrating-Fragebogen ausfüllen (keine sensiblen Inhalte — Antworten ableitbar aus `PLAY_STORE_BEREITSCHAFT.md`, Abschnitt Content-Compliance).
6. **App-Zugriff**: Falls ein Login erforderlich ist, Test-Zugangsdaten für die Prüfung hinterlegen (Admin-Account, NICHT öffentlich teilen).
7. Einreichen und Google-Prüfung abwarten (neue Apps: meist einige Tage).

## Checkliste direkt vor dem Upload

- [ ] `jarsigner -verify` wurde grün gemeldet (steht im Workflow-Log des AAB-Schritts)
- [ ] APK der gleichen Version auf einem echten Gerät installiert und geloggt (Backend `https://app.cybersarah-ki.com`)
- [ ] On-Server-KI-Test im Chat-Tab der App: Verbindung „On-Server" → Test muss grün melden (`gemini-flash-latest`)
- [ ] Datenschutzrichtlinien-URL hinterlegt (offener Punkt aus `PLAY_STORE_BEREITSCHAFT.md` — Dokument muss öffentlich erreichbar sein, z. B. GitHub-Pages oder im Backend ausgeliefert)
- [ ] Screenshots (5–8) vom Realgerät hochgeladen

## Nach der Freigabe

- Produktiver Release-Track von Test auf Produktion hochstufen.
- Betriebsbeobachtung: Crash-Berichte (ANR/Abstürze) und die Server-Metriken des Workspace-Services im Blick behalten; die Health-Endpunkte von App und Workspace melden Persistenz- und Provider-Status.
- Realgerät-Betriebserfahrung in die Key-Rotations-Parameter zurückfließen lassen (siehe `NEXT_STEPS.md`, mittelfristige Richtung).

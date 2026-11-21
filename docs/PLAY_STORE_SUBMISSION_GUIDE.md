# Android-Release und Google-Play-Handoff

**Gültige Paket-ID:** `com.cybersarah.controlcenter`  
**Build-Workflow:** `.github/workflows/build-apk.yml` — GitHub Actions, Expo-Web-Export, Capacitor und Gradle.

Dieses Dokument beschreibt den aktuell im Repository vorhandenen Build-Ablauf. Es ist keine Bestätigung, dass ein aktueller Release-Build bereits ausgeführt, auf einem Gerät getestet oder bei Google Play eingereicht wurde.

## 1. Release-Artefakte

Im GitHub-Repository unter **Actions → Build Android APK → Run workflow** kann optional eine Version im Format `X.Y.Z` angegeben werden. Ohne Angabe leitet der Workflow die nächste freie Patch-Version aus vorhandenen `vX.Y.Z-apk`-Releases ab.

Ein erfolgreicher Lauf soll diese Dateien im GitHub-Release `vX.Y.Z-apk` erzeugen:

| Artefakt | Zweck |
|---|---|
| `CyberSarah-ControlCenter-vX.Y.Z-dev.apk` | Debug-/Entwicklungsvariante; nicht bei Google Play hochladen |
| `CyberSarah-ControlCenter-vX.Y.Z-admin.apk` | Signierte Admin-Release-APK für direkten Gerätetest |
| `CyberSarah-ControlCenter-vX.Y.Z-release.aab` | Signiertes Android App Bundle für Google Play |
| `CyberSarah-ControlCenter-vX.Y.Z-manifest.json` | Build- und Signaturnachweis für die drei Artefakte |
| `CyberSarah-ControlCenter-vX.Y.Z-SHA256SUMS.txt` | Prüfsummen der Release-Dateien |

Die konkrete Versionsnummer und die tatsächlich veröffentlichten Dateien sind immer im jeweiligen Actions-Lauf und GitHub-Release zu prüfen. Ein grüner allgemeiner CI-Lauf ersetzt diesen Android-Release-Lauf nicht.

## 2. Voraussetzungen für einen signierten Build

Der Workflow verlangt folgende GitHub-Actions-Secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Der Keystore darf nicht ins Repository eingecheckt oder in Logs ausgegeben werden. Fehlt eines der Secrets, muss der Release-Preflight den Build abbrechen.

Der Workflow prüft außerdem Paket-ID, Versionsname, Android-Versioncode, Launcher-/Manifest-Voraussetzungen und anschließend die APK-/AAB-Signaturen. Das Release-Manifest enthält den Quell-Commit, die Workflow-Run-ID, Artefaktgrößen, SHA-256-Prüfsummen und öffentliche Zertifikatsfingerprints.

## 3. Google Play: vor dem Upload verifizieren

1. In der Google Play Console prüfen, ob die App bereits mit der Paket-ID `com.cybersarah.controlcenter` angelegt wurde. Eine vorhandene App mit einer anderen Paket-ID ist nicht dieselbe App; Paket-IDs dürfen nicht aus älteren Dokumenten übernommen werden.
2. Das AAB aus genau dem erfolgreich abgeschlossenen Android-Release-Lauf herunterladen.
3. Manifest und SHA-256-Datei gegen die heruntergeladenen Artefakte prüfen.
4. Im Actions-Log kontrollieren, dass `apksigner verify` für beide APKs und `jarsigner -verify` für das AAB erfolgreich waren.
5. Die Admin-APK auf einem realen Android-Gerät installieren und Login, Backend-Verbindung, zentrale Arbeitsabläufe, Berechtigungen und Absturzverhalten prüfen.
6. Store-Eintrag, Datenschutzangaben, Data-Safety-Antworten, Zielgruppe, Inhaltsfreigaben, App-Zugriff und Screenshots anhand des tatsächlich ausgelieferten Funktionsumfangs neu prüfen. Ältere Listing- oder Compliance-Texte sind keine automatische Bestätigung ihrer Aktualität.
7. Erst danach das AAB in einem internen oder geschlossenen Testtrack hochladen. Die Produktionsfreigabe bleibt eine bewusste Owner-Entscheidung.

## 4. EAS und GitHub Actions auseinanderhalten

Die Datei `.github/workflows/create-production-builds.yml` ist ein Integrations-Platzhalter und baut keine APK. Der dokumentierte Android-APK-/AAB-Pfad ist `.github/workflows/build-apk.yml`.

Ein roter EAS-Status ist deshalb nicht automatisch ein Fehler des GitHub-Android-Builds. Umgekehrt beweist ein grüner Platzhalter- oder allgemeiner CI-Status keinen erfolgreichen Android-Release.

Die Repository-Konfiguration weist darauf hin, dass die EAS-Verknüpfung noch an einen alten Kontonamen gebunden ist. Diese Verbindung muss separat neu eingerichtet werden, falls EAS weiterhin genutzt werden soll; sie ist keine Voraussetzung für den oben beschriebenen GitHub-Actions-APK-Workflow.

## 5. Aktueller Nachweisstatus

Vor einer Veröffentlichung müssen für den konkreten Commit alle folgenden Nachweise vorliegen:

- [ ] Android-Workflow erfolgreich abgeschlossen
- [ ] Entwicklungs-APK und signierte Admin-APK vorhanden
- [ ] AAB vorhanden und Signatur verifiziert
- [ ] Release-Manifest und SHA-256-Prüfsummen vorhanden und geprüft
- [ ] Admin-APK auf echtem Gerät installiert und getestet
- [ ] Datenschutz-/Store-Angaben für den aktuellen Build geprüft
- [ ] Interner oder geschlossener Play-Test durchgeführt

**Stand dieser Dokumentation:** Pipeline-Konfiguration geprüft; ein aktueller signierter Android-Build und ein Realgerätetest werden hiermit ausdrücklich nicht behauptet.

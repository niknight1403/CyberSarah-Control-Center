# CyberSarah Control Center — Sprint 97–106

## Ziel

Die Sprints 97 bis 106 bilden den kontrollierten Releasepfad zu **Version 2.0.0**. Jeder Sprint ist ein Gate: Änderungen werden lokal geprüft, bevor der nächste Bereich bearbeitet wird. Der finale APK-Build läuft erst nach TypeScript-Check, Tests, Produktionsbuild und Diff-Prüfung.

| Sprint | Release-Gate | Ergebnis |
|---|---|---|
| 97 | Dashboard-Betriebswacht | Admin-Statusansicht mit zentraler Ops-Aggregation ist integriert. |
| 98 | Onboarding und Provider | Bestehende Account-, Settings- und Provider-Flows bleiben typisiert und releasefähig. |
| 99 | Offline und Sync | Offline-Entwürfe, Konfliktwarnungen und Retry-Logik bleiben deterministisch testbar. |
| 100 | Agent und Review | Agent-Tooling, Diff-Review und kontrollierte Anwendung bleiben geschützt. |
| 101 | Datenschutz und Backups | Datenschutzrichtlinie, SecureStore und verschlüsselte Backups sind dokumentiert. |
| 102 | Android-Plattform | Portrait, Mindest-SDK, Berechtigungen und Capacitor-Pipeline sind konfiguriert. |
| 103 | Performance | Release-Build nutzt reproduzierbare npm-/Gradle-Schritte und begrenzte Statusabfragen. |
| 104 | Resilienz | Provider-Fallbacks, Healthchecks und tokenfreie Fehlerpfade werden durch die Suite abgedeckt. |
| 105 | Version 2.0 | Expo `version`, Android `versionName` und `versionCode` sind konsistent auf 2.0.0/20000 gesetzt. |
| 106 | Release | CI validiert den Stand; der manuell autorisierte Workflow erzeugt signierte APK und AAB als GitHub-Release. |

## Automatisierte Release-Sicherheit

`set-release-version.mjs` setzt die eingegebene semantische Version sowohl in `app.config.ts` als auch in `android/app/build.gradle`. Der APK-Workflow verwendet standardmäßig `2.0.0`, kann aber für einen kontrollierten Wiederholungsbuild eine andere semantische Version erhalten. Der Android-Versioncode wird deterministisch aus Major, Minor und Patch berechnet.

## Nicht automatisierbare Handoffs

Ein echter Android-Gerätetest, SecureStore-Validierung auf Hardware und eine Play-Store-Einreichung bleiben Owner-Schritte. Der Workflow kann eine signierte APK und ein signiertes AAB bauen und im GitHub-Release bereitstellen; er kann keinen physischen Gerätetest ersetzen.

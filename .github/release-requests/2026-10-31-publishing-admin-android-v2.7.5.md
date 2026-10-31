# CyberSarah Android v2.7.5 — Publishing-Sicherheit

Release-Anforderung: Signierte Admin-APK, Entwicklungs-APK und Play-Store-AAB
aus dem derzeitigen `main`-Stand (CyberSarah Control Center).

## Integrierte Änderungen seit v2.7.4

- Sicherer Publishing-Status bei konkurrierenden Workern: PostgreSQL-Atomarität.
- Keine Wiederholung bei verlorenem Social-Media-Provider-Acknowledgement.
- Android-/Web-Admin-Dashboard: ungeklärte Veröffentlichungen prüfen,
  mittels echter Beitrags-ID abschließen oder ohne Neuversand schließen.
- Revisionsfähige Prüfprotokolle mit administrativer Freigabe und Nutzergrenze.
- Serverseitige Datenbankmigration `0022` bereits live verifiziert.

## Abnahme-Gates

- Exakt Version 2.7.5, Paket `com.cybersarah.controlcenter`.
- `verify:system`, Integration-Audit, Expo-Web-Export, Web-Smoke,
  Capacitor-Sync, Gradle-assembleDebug/assembleRelease, Gradle bundleRelease.
- Release-Keystore aus GitHub-Secrets, APK-Signatur, AAB-Signatur,
  identische Pakete/Versionen, SHA256SUMS und signiertes Release-Manifest.
- Erst nach einem erfolgreichen Build dürfen APK-Download-Links ausgegeben
  oder das Release als fertig bezeichnet werden.
- Build demonstriert Paket und Exporte, nicht einen realen Android-Gerätetest.

Trigger: GitHub Actions `.github/workflows/build-apk.yml` auf Merge nach `main`.

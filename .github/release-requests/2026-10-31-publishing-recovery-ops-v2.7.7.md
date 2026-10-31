# CyberSarah Control Center v2.7.7

Signierter Android-Release aus gemergter Publishing-Autopilot-Änderung PR #161.

- Absturzsichere Vorversand-Wiederaufnahme mit gestaffelter Wartezeit.
- Exhaustive und potenziell bereits versandte Jobs werden nicht blind wiederholt.
- Sicherer manueller Wiederholungsweg nur vor Netzwerkversand.
- Mandantengebundene Admin-API und mobile Betriebsübersicht: reale Warteschlangen-
  und Statusmetriken, 24-h-Erfolge, Konfiguration der Plattformen.
- Verifizierte PostgreSQL-16-Paralleltests und vollständige Web-App-CI.
- Versionskennung 2.7.7, Admin-APK, Dev-APK, signiertes AAB,
  Signaturverifikation, SHA256SUMS und Release-Manifest.

Abnahme: Die GitHub Actions-Pipeline muss erfolgreich beendet sein und
Downloads als GitHub-Release-Artefakte enthalten; kein ungeprüfter APK-Link.
Realer Gerätetest und Social-Media-Provider-Posting sind nicht Teil des Builds.

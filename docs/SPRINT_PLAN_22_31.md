# CyberSarah Control Center — Sprintplan 22–31

Dieser Plan ergänzt den bestehenden Projektstand um zehn technische Sprints. Jeder Sprint wird separat umgesetzt, getestet und committed. Externe Aktionen wie das Starten eines verwalteten Android-Publishs und ein Test auf einem realen Gerät bleiben als manuelle Handoff-Schritte dokumentiert.

| Sprint | Ziel | Akzeptanzkriterium |
|---|---|---|
| 22 | Release- und Build-Metadaten zentral validieren | Ungültige Release-Konfigurationen werden deterministisch erkannt; gültige Konfigurationen liefern ein typisiertes Ergebnis. |
| 23 | Sicherheitsgrenzen für Konfigurations- und Backup-Daten härten | Secrets werden redigiert; Größen-, Typ- und Versionsgrenzen werden vor Persistenz und Restore geprüft. |
| 24 | Provider-Timeouts und Fehlerklassen vereinheitlichen | Timeout, Auth-, Netzwerk- und Konfigurationsfehler liefern stabile, tokenfreie Statuswerte. |
| 25 | Offline-Aufgabenstatus und Wiederholungslogik verbessern | Offline-Aktionen bleiben als Entwurf erhalten und können kontrolliert erneut ausgeführt werden. |
| 26 | Release- und Server-Healthchecks erweitern | Healthchecks liefern strukturierte, nicht-sensitive Diagnosedaten und klare Warnstufen. |
| 27 | Benachrichtigungszustände und Deduplizierung absichern | Identische Statusereignisse werden unterdrückt; Zustandswechsel erzeugen genau eine Meldung. |
| 28 | CI/CD-Validierung und Artefakt-Handoff verbessern | CI prüft alle neuen Module und erzeugt nachvollziehbare Release-Handoff-Ausgaben. |
| 29 | Android-/Portrait-Regressionen ausbauen | Kritische Touch-, Navigation- und Branding-Annahmen werden deterministisch getestet. |
| 30 | Dokumentation und Betriebshandbuch vervollständigen | Installation, Secrets, systemd, ntfy, Render und Publish-Handoff sind konsistent dokumentiert. |
| 31 | Gesamt-Regression, Release-Preflight und Abschluss | TypeScript, Tests, Build, Service-Syntax, Secret-Scan und Git-Status sind erfolgreich; Abschlussbericht liegt vor. |

## Externe Handoff-Punkte

Der verwaltete Android-Publish, der APK-Download und der Test auf einem echten Gerät benötigen weiterhin eine Nutzeraktion in der Management-Oberfläche beziehungsweise auf einem Android-Gerät. Diese Schritte werden nicht als automatisch erledigt behauptet.

# CyberSarah Control Center — Sprintplan 32–41

Dieser Plan setzt den dokumentierten Projektstand nach Sprint 31 fort. Jeder Sprint wird separat umgesetzt, getestet und committet. Externe Aktionen wie APK-Builds über die Publish-Oberfläche, EAS-Buildkontingent und Realgerät-Tests bleiben manuelle Handoff-Schritte und werden nicht als automatisch erledigt behauptet.

| Sprint | Ziel | Akzeptanzkriterium |
|---|---|---|
| 32 | Provider-Nutzungsbudget und Verbrauchsstände einführen | Nutzungsdaten werden pro Zeitfenster deterministisch zu Budget-Statuswerten (ok, warnung, erschöpft) verrechnet; Ausgaben bleiben tokenfrei. |
| 33 | Entwicklungschats deterministisch komprimieren | Lange Chat-Verläufe werden auf ein konfigurierbares Limit reduziert; entfernte Inhalte erscheinen als stabil hashender Verdauungseintrag, jüngste Inhalte bleiben unverändert. |
| 34 | Sync-Konflikte zwischen lokal und Remote klassifizieren | Dateikonflikte werden eindeutig klassifiziert (beide geändert, nur lokal, nur remote, identisch) und nur mit explizit sicheren Auflösungen automatisch auflösbar. |
| 35 | Agenten-Vorschläge in einer priorisierten Warteschlange führen | Vorschläge werden nach Priorität geordnet, dedupliziert, laufen kontrolliert ab und durchlaufen feste Zustände (offen, review, angewendet, abgelehnt, abgelaufen). |
| 36 | Änderungs-Snapshots und kontrollierten Rollback absichern | Vor jeder Anwendung wird ein integritätsgeprüfter Snapshot erzeugt; Rollback stellt ausschließlich verifizierte Inhalte wieder her und ist nur einmal ausführbar. |
| 37 | Audit-Log rotationieren und tokenfrei exportieren | Audit-Einträge werden nach Alter und Anzahl deterministisch gekürzt; der Export enthält nie Secrets, Tokens oder Endpoints. |
| 38 | Provider anhand gemessener Latenz bewerten und reihen | Latenzmessungen erzeugen eine stabile Bewertung pro Provider; veraltete Messungen fließen nicht ein; Fallback-Empfehlungen sind begründet. |
| 39 | Changelog aus Sprint- und Commit-Einträgen erzeugen | Commit-Einträge werden nach Typ gruppiert, deterministisch sortiert und als versionsfähiges Changelog ohne sensitive Daten ausgegeben. |
| 40 | Offline-Warteschlange mit exponentiellem Backoff versehen | Wiederholungszeitpunkte werden mit Exponential-Backoff, Jitter-Obergrenze und Maximalversuchen berechnet; Konflikte blockieren die Wiederholung. |
| 41 | Gesamt-Regression, Release-Preflight und Abschluss | TypeScript, Tests, Build, Service-Syntax, Secret-Scan und Git-Status sind erfolgreich; Abschlussbericht liegt vor. |

## Externe Handoff-Punkte

Der Android-Publish über die Publish-Oberfläche, das EAS-Buildkontingent und der Test auf einem echten Android-Gerät bleiben Nutzeraktionen. Diese Sprints liefern ausschließlich die automatisiert prüfbaren Anteile.

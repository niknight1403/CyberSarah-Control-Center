# Growth Evidence Release: zehn Schritte

Stand: 23.11.2026. Diese Änderungen belegen keine neue Reichweite, Nutzer oder Umsätze.

| Schritt | Ergebnis | Prüfung |
|---|---|---|
| 1 | Eingecheckte `.env`-Sicherung aus dem aktuellen Branch entfernt | `git ls-files` |
| 2 | Lokale `.env`-Kopien und Backups ignoriert | `.gitignore` |
| 3 | Weiteres Produktions-Env-Artefakt entfernt und Dateinamen-Gate ergänzt | `node scripts/check-tracked-env.mjs` |
| 4 | Gate vor der Dependency-Installation in CI eingebunden | `.github/workflows/ci.yml` |
| 5 | Zukünftige Messzeitpunkte gesondert als Fehlerhinweis markiert | Datenqualitätstest |
| 6 | Leerer Funnel gilt nicht mehr als bestätigte Reichweite | Datenqualitätstest |
| 7 | API nennt Messfenster, Quelle und letzten Messzeitpunkt | `growthPulseOverview` |
| 8 | Admin-Ansicht zeigt Quelle und fehlenden Beleg sichtbar | Revenue-Autopilot-Karte |
| 9 | Manueller Draft-Start wartet bei Datenprüfung | UI-Gate und bestehender Server-Gate |
| 10 | Betriebsabnahme und Grenzen dokumentiert | dieses Dokument |

## Vor einem produktiven Release

1. Prüfen, ob der historisch eingecheckte `METRICS_TOKEN` jemals gültig war. Falls ja: auf Render und allen weiteren Einsatzorten rotieren. Das Entfernen der Datei löscht **nicht** den Git-Verlauf; vorhandene Zugriffe auf alte Commits müssen berücksichtigt werden.
2. CI, TypeScript, Lint und relevante Tests auf dem Ziel-Commit grün bestätigen. Einen Android-Echtgerätetest mit Start, Login, Navigation und Checkout durchführen.
3. Für eine Reichweitenaussage Plattform-Insights und Webanalyse verbinden; Impressionen, Besucher, Klicks, Leads und Käufe mit Zeitraum und Quelle abgleichen. Selbst erzeugte Tests und Admin-Aufrufe getrennt zählen.
4. Für Umsatz ausschließlich bestätigte Zahlungsereignisse, Refunds und aktive Abos mit Stripe abgleichen. Attributionsereignisse allein sind kein Zahlungs- oder Gewinnnachweis.
5. Einen echten Besuch-zu-Abo-Durchlauf im Testmodus dokumentieren und erst danach die produktive Freigabe beurteilen. Externe Veröffentlichung und Ausgaben bleiben an die bestehenden Freigaben gebunden.

Die Messbasis in der Admin-Karte ist die 30-Tage-Ansicht für die feste Channel-Persona. Sie ist keine globale Reichweite aller CyberSarah-Kanäle. Ein gültiger Zähler belegt noch keine unabhängige Person; dafür sind deduplizierte Besucher- und Plattformsignale erforderlich.

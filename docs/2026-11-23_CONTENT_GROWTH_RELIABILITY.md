# Content- und Reichweitenkette: zehn Folgeschritte

Der Channel-Autopilot erzeugte bisher Textentwürfe mit `youtube/shorts`. Diese Plattform ist in Freigabe und Publishing nicht unterstützt. Neue Entwürfe nutzen `threads`, einen unterstützten Textkanal; alte bereits freigegebene YouTube-Entwürfe werden nicht stillschweigend auf einen anderen Kanal umgelenkt.

Die zehn Änderungen betreffen: (1) kompatibles Entwurfsziel, (2) gemeinsame Publishing-Liste, (3) dieselbe Liste im Freigabe-Gate, (4) Messprüfung im Channel-Lauf, (5) getrennten Status in dessen Übersicht, (6) Regression für fehlende/veraltete Messung, (7) Reichweiten-spezifische Ereigniszeit, (8) gültige Plattform-Insights als Frischebeleg, (9) vergleichbare Trendfenster und (10) einen Textkanal ohne erforderliches Bild-/Video-Asset.

## Abnahme

- Lokal: Typprüfung, Lint, gezielte Tests und Growth-Audit.
- Auf GitHub: PR-CI und Secret-Scan; keine automatische Zusammenführung bei roten Prüfungen.
- Produktiv: Freigabe eines neuen Threads-Textentwurfs, Nachweis der Einreihung unter `sourceDraftId`, dann ein kontrollierter Publishing-Versuch nur mit gültigem Konto und Berechtigung. Der Code allein beweist keine Veröffentlichung.
- Reichweite: Quelle und Zeitraum gegen externe Plattform-Insights abgleichen. Admin-erfasste Attributionsereignisse sind keine unabhängige Nutzerzählung und kein Zahlungsnachweis.

Eine fehlende Threads-Verbindung kann die Live-Ausspielung weiterhin verhindern. Der freigegebene Entwurf bleibt als Auftrag nachvollziehbar und braucht gegebenenfalls einen korrigierten Verbindungspfad.

# CyberSarah Revenue OS 2.0 — verbindliche Designrichtung

**Auswahl:** Design 4 — MOBILE FIRST (vom Nutzer bestätigt am 28.10.2026).

## Produktprinzipien
- Smartphone ist die primäre Zieloberfläche, Desktop eine adaptive Erweiterung.
- Ein zentraler Revenue-OS-Hub statt doppelter Hubs.
- Navigation mit maximal fünf primären Zielen: Home, Autopilot, Influencer, Content, Mehr.
- Daumenfreundliche Bedienelemente, mindestens 44 × 44 CSS-Pixel Touch-Ziele, sichere Abstände zu Systemleisten.
- Home zeigt echte Daten: Umsatz, Reichweite, Leads, Conversions und Systemzustand. Keine erfundenen KPIs oder grünen Zustände bei fehlender Telemetrie.
- Autopilot: aktuelle Aktion, letzter Erfolg, Blocker, nächste Ausführung, Pause/Fortsetzen, nachvollziehbares Audit-Protokoll.
- Influencer: Nova, Mira, Juno, Lina, Kaya, Zara; eindeutige Profile, KI-Kennzeichnung, Status und messbare Performance.
- Content Factory: Ideen, Entwürfe, Freigaben, Veröffentlichungen, Messergebnisse.
- Premium Cyber Spatial: tiefes Navy, sparsame Cyan-/Violett-Akzente, Glass-Surfaces, kontrastreiche Typografie, subtile Animationen; reduzierte Bewegung respektieren.
- Bei Verbindungsfehlern: klare Fehler- und Wiederholungszustände statt Fake-Erfolg.

## Umsetzung / Akzeptanz
1. Bestehende Navigation und mobile Breakpoints prüfen, doppelte Hubs konsolidieren.
2. Mobile Shell und Bottom Navigation mit sichtbarem Fokus und Screenreader-Labels.
3. Home-/Autopilot-/Persona-/Content-Ansichten mit echten APIs verbinden.
4. 320/360/390/430 px sowie Tablet/Desktop visuell und funktional prüfen.
5. Accessibility, Lint, Typprüfung, Unit-/Integration-/E2E-Tests, Build und Live-Healthcheck prüfen.
6. Vor jedem größeren Schritt Git-Commit; vor Deployment einen wiederherstellbaren Release-Stand sichern. Keine Behauptung, dass ein Chat-Limit exakt vorhergesagt werden kann.

**Hinweis:** Dieses Dokument fixiert die Designentscheidung. Es behauptet keine bereits abgeschlossene UI-Implementierung.

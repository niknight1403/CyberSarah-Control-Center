# Store-Assets — Screenshot-Set für die Play-Console-Einreichung

Stand: 11.09.2026 — Sprint 83

Dieses Verzeichnis nimmt die finalen Screenshots und Werbematerialien für den Play-Store-Auftritt auf. **Finale Aufnahmen müssen vom Realgerät** (Produktions-Build, Backend `https://app.cybersarah-ki.com`) **stammen** — Emulatorbilder sind nur Platzhalter und vor der Einreichung zu ersetzen.

## Vorgaben Google Play (Hochformat, da App nur Portrait)

| Asset | Größe | Anzahl | Status |
|---|---|---|---|
| Screenshots (Handy) | 1080×1920 px (16:9) oder 1080–2567 px | min. 2, empfohlen 8 | Gerüst unten |
| Feature-Grafik | 1024×500 px | 1 | Vorhanden (prüfen gegen Theme-Highlights) |
| App-Icon | 512×512 px | 1 | Aus adaptivem Icon ableiten |
| Werbegrafik | 1200×628 px (optional) | 1 | Optional |

## Geplante Screenshots (8 Kernmotive)

Jeweils in **Deutsch** (Primärmarkt), ggf. zusätzlich Englisch. Empfohlenes Motiv-Set — Reihenfolge = Store-Reihenfolge:

1. **chat-entwicklung.png** — Chat-Entwicklungsfenster mit Streaming-Ausgabe und syntax-highlightetem Diff (Agent entwickelt Code; hervorheben: Live-Streaming + Diff-Viewer)
2. **design-themes.png** — Drei-Design-Trias: Cyber Neon / Enterprise Slate / Glas-Modern (nebeneinander oder drei Aufnahmen; hervorheben: Theme-Wechsel)
3. **agent-zielzerlegung.png** — Agentenbereich mit Ziel-Zerlegung/Ausführungsgraph (hervorheben: autonome Ausführung, Schleifen-Erkennung)
4. **workspace-diff.png** — Workspace mit Datei-Diff und Konfliktansicht (hervorheben: Kontrolle vor Anwendung)
5. **provider-routing.png** — Verbindungstest mit Latenz-Ranking/Key-Pool-Ansicht (hervorheben: Key-Rotation, Smart Routing; Keys maskiert!)
6. **admin-dashboard.png** — Admin-Dashboard mit Abo-/Kontingent-Übersicht (hervorheben: Stufen Free→Elite)
7. **studio-uebersicht.png** — Studio-Hauptscreen mit responsiver Sidebar (Tablet-Aufnahme, um Breitennutzung zu zeigen)
8. **settings-backup.png** — Einstellungen mit Backup/Design-Auswahl (hervorheben: verschlüsselte Backups, Datenschutz)

## Produktionsregeln für die Aufnahmen

- Produktions-Build der Version 1.3.0 (Release-APK aus dem GitHub-Release `v1.3.0-apk`), kein Debug-Wasserzeichen.
- Keine echten API-Keys, Tokens, echten E-Mail-Adressen oder privaten Projektdaten im Bild — Beispielprojekte und maskierte Keys verwenden.
- Statusleiste sauber (volle Akku-/Signalanzeige, keine Test-Banner).
- Optional dezenter Beschreibungstext pro Screenshot (max. 6–8 Wörter) — Schriftart aus dem Design-System, nicht System-Default.
- Feature-Grafik: App-Name + bis zu 3 Kernversprechen („Deine KI-Agenten. Deine Kontrolle." / Themes / Connectors).

## Einreichung

Die eigentliche Einreichung (AAB-Upload aus dem GitHub-Release `v1.3.0-apk`, Listing-Texte aus `docs/PLAY_STORE_LISTING_DE_EN.md`, Data-Safety aus `docs/PLAY_STORE_DATA_SAFETY.md`) ist ein **manueller Handoff-Punkt** — siehe `PLAY_STORE_BEREITSCHAFT.md` und `docs/SECRETS_AND_RELEASE.md` (interner Track zuerst, Draft-Status).

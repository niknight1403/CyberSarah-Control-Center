# Sprint 242–251 — Ideen-Inbox (ehrliches Vergilben statt stiller Ablage)

**Status:** Abgeschlossen (24.09.2026) — 10 Sprints, lokal voll validiert
(TypeScript, Lint, Suite, Build), auf `main` gepusht.

## Ziel

Nach Gedächtnis (201–211), Paper-Trading (212–221), Umsatz-Schleifen
(222–231) und Fokus & Rückblick (232–241) fehlte die Vorstufe jeder
Verpflichtung: **wohin mit den Rohgedanken?** Diese Reihe baut eine
**Ideen-Inbox** mit denselben Ehrlichkeits-Regeln:

> **Eine Idee ist ein Rohgedanke, keine Verpflichtung.** Nichts verlässt die
> Inbox von selbst: keine automatische Löschung, keine stille Umwandlung in
> Fokus-Punkte. Triage-Vorschläge sind Vorschläge — entschieden wird nur mit
> Freigabe.

## Die zehn Sprints

| Sprint | Inhalt |
|---|---|
| 242 | Kern-Domäne `lib/idea-inbox-logic.ts`: `IdeaItem` mit Quelle und Status (Eingang/behalten/gepflanzt/fallen gelassen), strenge Validierung, bewusstes Inbox-Limit von 30 offenen Ideen |
| 243 | Ideen-Reifung als Beobachtung: frisch/vergilbt/verwelkend mit Tageszahl — vergilbende Ideen sichtbar machen statt Mahnungen zu senden |
| 244 | Deterministische Triage-Engine: verwelkend → Fallenlassen-Vorschlag, zeitlich gemeint → Pflanzen-Vorschlag, frisch → liegen lassen (frühe Triage erzeugt Pseudo-Verpflichtungen) |
| 245 | Deutsches Prompt-Parsing (notieren/triage/status/liste/behalten/pflanzen/streichen, Quelle als Pflichtfeld mit ehrlichem Standard „spontan", verneinte Aufträge nie ausführend) |
| 246 | Ehrlicher Ergebnis-Builder: voller Eingang wird abgelehnt, doppelt Pflanzen als unehrlich benannt, Triage mit Begründung und Freigabe-Merkmal |
| 247 | Persistenz `lib/idea-inbox-store.ts`: injizierbarer KV-Adapter, max. 300 Punkte — entschiedene Ideen werden zuerst geopfert, offene zuletzt; korrupter Speicher gemeldet und sicher entfernt |
| 248 | Hook `hooks/use-idea-inbox.ts`: Laden/Speichern, Prompt-Auswertung; jede Mutation ausschließlich über `approvePending`; Pflanzen erzeugt einen eigenen Vorschlag |
| 249 | Screen `app/(tabs)/ideas.tsx`: Eingang mit Alters-Zeilen, Bestätigungs-Karte, Triage-Plan-Karte; Tab (Leiste ausgeblendet) + Drawer-Eintrag |
| 250 | Single-Writer-Brücke `lib/idea-focus-bridge.ts`: prüft ehrlich, ob/wann eine Idee als Fokus-Punkt pflanzbar wäre (Tageskapazität, Titel-Länge) — angelegt wird ausschließlich im Fokus-Modul mit dessen Bestätigungs-Flow; Hook liest Fokus-Punkte nur lesend |
| 251 | Abschluss: Dokumentation, CHANGELOG, volle Validierung, Push |

## Architektur-Regeln (wie Fokus-Modul 232–241)

- **Reine Logik** (`lib/idea-inbox-logic.ts`, 24 Tests; `lib/idea-focus-bridge.ts`, 4 Tests): Alterung, Triage, Parsing, Ergebnis-Aufbau und Pflanzen-Befund sind deterministisch und ohne I/O testbar.
- **I/O isoliert** (`lib/idea-inbox-store.ts`, 5 Tests): Adapter injizierbar, Fehler weitergegeben, nie geschluckt.
- **Single-Writer:** Die Ideen-Inbox schreibt nur ihren eigenen Speicher; die Brücke liest Fokus-Punkte nur lesend, das Anlegen bleibt im Fokus-Modul.

## Bewusste Grenzen (Ehrlichkeit vor Funktionsumfang)

- **Keine automatische Triage:** Der Plan ist ein Vorschlag mit Begründung, nie
  eine Ausführung — auch nicht teilweise.
- **Frische Ideen liegen zuerst:** Frühe Triage-Bereitschaft würde aus Impulsen
  Pseudo-Verpflichtungen machen; der Vorschlag „liegen lassen" ist bewusst.
- **Verwelken ist keine Löschung:** Selbst 30 Tage alte Ideen bleiben
  sichtbar, bis der Nutzer fällt lässt oder pflanzt.
- **Quelle ist Pflicht:** Ohne Herkunft ist eine Idee später nicht mehr ehrlich
  einzuordnen; „spontan" ist der benannte Standard, kein Weglassen.

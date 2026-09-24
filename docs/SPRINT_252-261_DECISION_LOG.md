# Sprint 252–261 — Entscheidungs-Journal (Wetten auf die Zukunft ehrlich nachprüfen)

**Status:** Abgeschlossen (24.09.2026) — 10 Sprints, lokal voll validiert
(TypeScript, Lint, Suite, Build), auf `main` gepusht.

## Ziel

Die sechste Säule neben Gedächtnis (201–211), Paper-Trading (212–221),
Umsatz-Schleifen (222–231), Fokus & Rückblick (232–241) und Ideen-Inbox
(242–251): **was, als ich mich entschied, habe ich mir davon versprochen —
und ist es eingetroffen?** Ehrlichkeits-Regeln:

> **Eine Entscheidung ist eine Wette auf die Zukunft.** Sie wird mit einer
> prüfbaren Erwartung und einem Nachprüf-Tag festgehalten. Beim Nachprüfen
> zählt der Vergleich, nicht die Rechtfertigung: Eine Erwartung, die nicht
> eintrat, ist ein Ergebnis, kein Vorwurf. Ersetzte Entscheidungen bleiben
> als Verlauf lesbar — rückwirkendes Schönen ist ausgeschlossen.

## Die zehn Sprints

| Sprint | Inhalt |
|---|---|
| 252 | Kern-Domäne `lib/decision-log-logic.ts`: `DecisionItem` mit Titel, Kontext, prüfbarer Erwartung (10–400 Zeichen, „geht gut" wird abgelehnt) und Pflicht-Nachprüf-Tag (ISO), bewusstes Limit von 40 offenen Entscheidungen |
| 253 | Nachprüfungs-Verdikt: bestätigt / nicht eingetroffen / unklar — explizite Unsicherheit geht vor; leere Berichte bleiben ehrlich unklar statt still zu bestätigen; applyReviewVerdict ändert nie die Ursprungs-Formulierung |
| 254 | Ersetzen als sichtbarer Verlauf: die alte Entscheidung bleibt mit Status „ersetzt" lesbar, doppelt Ersetzen wird als Verlaufslüge abgelehnt, `describeSupersedeChain` zeigt die Kette chronologisch |
| 255 | Deutsches Prompt-Parsing (`Entscheidung: …; Erwartung: …; Nachprüfen: …`, `Nachprüfen für "X"; Ergebnis: …`, `Ersetze "X"; Entscheidung: …`), verneinte Aufträge („nicht nachprüfen", „nichts ersetzen") nie ausführend |
| 256 | Ehrlicher Ergebnis-Builder: Fälligkeiten werden gemeldet ohne Mahnton („fällig heißt gesehen werden, nicht verurteilt werden"), bereits Geprüftes wird vor doppelter Prüfung bewahrt („doppelt Prüfen wäre Schönung") |
| 257 | Persistenz `lib/decision-log-store.ts`: injizierbarer KV-Adapter, max. 250 Einträge — entschiedene zuerst geopfert, offene zuletzt; korrupter Speicher gemeldet und sicher entfernt |
| 258 | Hook `hooks/use-decision-log.ts`: Anlegen, Nachprüfen und Ersetzen ausschließlich über `approvePending`; supersede geht nur durch die reine Funktion mit Verlaufs-Garantie |
| 259 | Screen `app/(tabs)/decisions.tsx`: offene Entscheidungen mit Erwartungs-Zeilen, Fälligkeits-Chips, Bestätigungs-Karte, Verlaufs- und Ketten-Ansicht; Tab (Leiste ausgeblendet) + Drawer-Eintrag |
| 260 | (im Hook-Sprint mit aufgeführt: Freigabe-Pflicht inkl. Verlaufs-Garantie) |
| 261 | Abschluss: Dokumentation, CHANGELOG, volle Validierung, Push |

## Architektur-Regeln (wie alle vorherigen Module)

- **Reine Logik** (`lib/decision-log-logic.ts`, 25 Tests): Validierung,
  Verdikte, Ersetzungs-Kette, Parsing und Ergebnis-Aufbau deterministisch
  und ohne I/O testbar.
- **I/O isoliert** (`lib/decision-log-store.ts`, 6 Tests): Adapter
  injizierbar, Fehler weitergegeben, nie geschluckt.
- **Hook orchestriert nur:** `runPrompt` stellt dar, `approvePending`
  ändert — und speichert danach.

## Bewusste Grenzen (Ehrlichkeit vor Funktionsumfang)

- **Keine Trefferquoten:** Das Journal zählt keine „Entscheidungsquote" —
  wer Quoten optimiert, optimiert die Erzählung, nicht die Entscheidung.
- **Unklar ist ein legitimes Verdikt:** Nicht alles ist messbar; „unklar"
  dokumentiert das, statt es zur Zahl zu schönen.
- **Verlauf wird nie überschrieben:** Die alte Erwartung steht weiterhin
  am ersetzten Eintrag, Wort für Wort.

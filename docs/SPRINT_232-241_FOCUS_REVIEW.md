# Sprint 232–241 — Fokus & Rückblick-Modul (ehrliche Tagesverpflichtung statt Produktivitäts-Noten)

**Status:** Abgeschlossen (24.09.2026) — 10 Sprints, lokal voll validiert
(TypeScript, Lint, Suite, Build), auf `main` gepusht.

## Ziel

Das Control Center hatte Module für Gedächtnis (201–211), Paper-Trading
(212–221) und Umsatz-Schleifen (222–231) — aber keine Antwort auf die Frage,
worauf der Nutzer sich heute festlegt und was die Woche ehrlich zeigt. Diese
Reihe baut ein **Fokus & Rückblick-Modul** nach dem gleichen Sicherheitsmuster:

> **Max. 3 Fokus-Punkte pro Tag.** Anlegen, Erledigen, Verschieben und
> Streichen passieren ausschließlich nach expliziter Bestätigung — und der
> Wochenrückblick zählt Beobachtungen, keine Noten.

## Die zehn Sprints

| Sprint | Inhalt |
|---|---|
| 232 | Kern-Domäne in `lib/focus-review-logic.ts`: `FocusItem` (Tag, Titel, Status aktiv/erledigt/verschoben/fallen gelassen), strenge Validierung, ISO-Tages-Schlüssel, bewusstes Tageslimit von 3 Punkten |
| 233 | Ehrliche Tages-Bewertung: leerer Tag ist gültig und kein Versäumnis, Verschiebungen bleiben sichtbar, Übererfüllung wird gezeigt statt versteckt |
| 234 | Wochenrückblick (Montag-basiert) ohne Produktivitäts-Score: Erledigt-Anteil ist Beobachtung, Muster werden benannt (reaktive Woche, Überverpflichtung) |
| 235 | Deterministische Reflexionsfragen: max. 2 Fragen passend zum Muster der Woche (Punktgröße statt Willenskraft, wiederholbare Bedingungen, Kalender statt Charakterzug) |
| 236 | Deutsches Prompt-Parsing: Klartext-Tage (heute/morgen/Wochentag/ISO), neue Punkte per `Fokus: <Titel>; Notiz: …`, verneinte Aufträge werden nie ausführend |
| 237 | Ehrlicher Ergebnis-Builder: volle Tage werden abgelehnt, uneindeutige Titel benannt, Änderungen nur als Freigabe-Anfragen formuliert |
| 238 | Persistenz `lib/focus-review-store.ts`: injizierbarer KV-Adapter, max. 400 Punkte chronologisch gekürzt, korrupter Speicher gemeldet und sicher entfernt |
| 239 | Hook `hooks/use-focus-review.ts`: Laden/Speichern, Prompt-Auswertung; jede Mutation ausschließlich über `approvePending` |
| 240 | Screen `app/(tabs)/focus.tsx`: heutiger Tagesfokus mit echten Punkten, Bestätigungs-Karte, Wochenrückblick mit Reflexionsfragen; Tab (Leiste ausgeblendet) + Drawer-Eintrag |
| 241 | Abschluss: Dokumentation, CHANGELOG, volle Validierung, Push |

## Architektur-Regeln (wie Loop-Engineering 222–231)

- **Reine Logik** (`lib/focus-review-logic.ts`): Validierung, Tages-/Wochen-
  Bewertung, Fragenauswahl, Prompt-Parsing und Ergebnis-Aufbau sind
  deterministisch und ohne I/O testbar. 33 Tests.
- **I/O isoliert** (`lib/focus-review-store.ts`): Adapter injizierbar,
  Fehler werden weitergegeben, nie geschluckt. 6 Tests.
- **Hook orchestriert nur**: `runPrompt` stellt dar, `approvePending` ändert —
  und speichert danach. Der Screen rendert Zustände, er entscheidet nichts.

## Bewusste Grenzen (Ehrlichkeit vor Funktionsumfang)

- **Keine Produktivitäts-Bewertung:** Prozentwerte sind Beobachtungen mit
  ausdrücklichem „keine Note"-Etikett; keine Streaks, keine Gamification.
- **Verschieben ist eine Status-Änderung, keine Tag-Kopie:** der Punkt bleibt
  am ursprünglichen Tag als „verschoben" sichtbar — der Rückblick soll die
  echte Geschichte zeigen.
- **Reflexionsfragen geben keine Antworten vor:** jede Frage endet offen, das
  Rationale erklärt nur, warum gerade diese Frage gestellt wird.
- **Fokus ist bewusst klein:** 3 Punkte/Tag sind ein Planungslimit, kein
  Leistungsziel; Übererfüllung wird sichtbar, aber nicht als neuer Standard
  empfohlen.

## Gitleaks-Hinweis

Nach den Erfahrungen aus Sprint 231 trägt die Speicher-Konstante von Anfang
an den Namen `FOCUS_STORAGE_ID` — Bezeichner mit KEY-Suffix und String-Wert
lösen die `generic-api-key`-Regel von Gitleaks als Fehlalarm aus.

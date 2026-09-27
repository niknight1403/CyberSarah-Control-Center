# Sprint 222–231 — Loop-Engineering-Modul (echte Entwürfe statt Platzhalter)

**Status:** Abgeschlossen (24.09.2026) — 10 Sprints, lokal voll validiert
(TypeScript, Lint, Suite, Build), auf `main` gepusht.

## Ziel

Der Loop-Engineering-Tab zeigte vier hartkodierte Beispiel-Karten. Diese
Sprint-Reihe macht daraus ein prompt-gesteuertes Planungsmodul für
Umsatz-Schleifen — nach dem Muster von Speicher-Manager (201–211) und
Micro-Trading (212–221):

> **Jede Schleife ist ein Entwurf.** Erstellen, Starten, Messwerte, Abschluss
> und Verwerfen passieren ausschließlich nach expliziter Nutzer-Bestätigung —
> keine automatische Ausführung, keine Umsatzversprechen.

## Die zehn Sprints

| Sprint | Inhalt |
|---|---|
| 222 | Kern-Domäne in `lib/revenue-loop-logic.ts`: `LoopDraft` (Name, Fluss, Hypothese, Experiment, Messgröße, Einheit, Ziel), strenge Validierung mit sprechenden Ablehnungen, Status-Labels, geklemmter Fortschritt |
| 223 | Ehrliche Fortschritts-Auswertung: ohne Messpunkte ist der Fortschritt „unbekannt", nicht null; Trend erst ab zwei Messpunkten; Abschluss braucht Bestätigung |
| 224 | Deterministische Nächster-Schritt-Empfehlung je Status — alle ändernden Schritte mit `requiresApproval` |
| 225 | Experiment-Planer: Messfenster mind. 7 / max. 90 Tage, Mini-Ziel-Warnung, `promisedRevenue: false` ist ein fester Typ |
| 226 | Deutsches Prompt-Parsing: create/sample/advance/discard/status/list, Feld-Extraktion (Name:, Fluss:, …), verneinte Aufträge werden nie ausführend |
| 227 | Ehrlicher Ergebnis-Builder: uneindeutige Namen werden benannt, Änderungen nur als Freigabe-Anfragen formuliert |
| 228 | Persistenz `lib/revenue-loop-store.ts`: injizierbarer KV-Adapter (AsyncStorage), begrenzt auf 50 Schleifen, korrupter Speicher wird gemeldet und sicher entfernt |
| 229 | Hook `hooks/use-loop-engineering.ts`: Laden/Speichern, Prompt-Auswertung; jede Mutation ausschließlich über `approvePending` |
| 230 | Screen-Rebuild: echte Entwurfs-Karten mit Fortschritt/Bewertung/Nächster-Schritt, Bestätigungs-Karte, ehrliche Leer-/Lade-Fehler-Zustände |
| 231 | Abschluss: Dokumentation, CHANGELOG, volle Validierung, Push |

## Architektur-Regeln

- **Reine Logik** (`lib/revenue-loop-logic.ts`): jede Entscheidung deterministisch
  und ohne I/O testbar. 24 Tests.
- **I/O isoliert** (`lib/revenue-loop-store.ts`): Adapter injizierbar, Fehler
  werden weitergegeben, nie geschluckt. 5 Tests.
- **Hook orchestriert nur**: `runPrompt` stellt dar, `approvePending` ändert —
  und speichert danach. Der Screen rendert Zustände, er entscheidet nichts.

## Bewusste Grenzen

- Kein Umsatz-Tracking, keine Anbindung an Bezahldienste: Messwerte erfasst der
  Nutzer manuell — das Modul zählt ehrlich mit, es erfindet nichts.
- Konfidenz-/Trend-Aussagen sind Beobachtungen auf erfassten Punkten, keine
  Prognosen (fester Disclaimer in jedem Ergebnis).
- Die Bestätigungs-Karte ist bewusst die einzige Tür zu Änderungen: Auch
  „Messpunkt erfassen" bleibt eine Freigabe, damit keine Zahl versehentlich
  in eine laufende Messung gerät.

## Nachtrag (24.09.2026): Gitleaks-Fehlalarm behoben

Der Gitleaks-Secret-Scan schlug beim Push der Reihe fehl: die Regel
`generic-api-key` meldete die Speicher-Konstante des Moduls (Bezeichner endete
auf KEY) samt AsyncStorage-ID-String als Geheimnis. Das war ein False
Positive — dahinter steckt nur der lokale Speicher-Bezeichner, kein Token.
Behoben durch ehrliche Umbenennung der Konstante in `LOOP_STORAGE_ID`
(der gespeicherte Bezeichner-String bleibt unverändert, bestehende lokale
Daten bleiben also lesbar). Kein Scanner-Allowlist-Eintrag, kein
History-Rewrite nötig: der nächste Scan-Range beginnt nach dem alten Commit.

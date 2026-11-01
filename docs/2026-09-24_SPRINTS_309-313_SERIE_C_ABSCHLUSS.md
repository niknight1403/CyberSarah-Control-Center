# Sprints 309–313 — Serie C Abschluss (24.09.2026)

## Sprint-Uebersicht
- **Sprint 309** `lib/media-cache-cleanup-logic.ts`: Medien-Cache mit 14-Tage-TTL,
  Byte-Budget (512 MB) und Eintragsdeckel (200); Aufraeumauftrag plant Loeschungen
  aelteste/abgelaufene zuerst, meldet befreite Bytes und was bleibt — niemals
  "Cache leer"-Luegen.
- **Sprint 310** `lib/srt-export-logic.ts`: SRT-Untertitel-Export aus dem Szenen-
  Skript mit lueckenlosen Zeitfenstern aus der TTS-Dauer-SCHAETZUNG; Header markiert
  die Schaetzung ehrlich, validateSrt prueft Indices/Fenster/Texte strukturell.
- **Sprint 311** `lib/batch-export-logic.ts`: Batch-Export mehrerer Projekte mit
  Fehlerfortsetzung — ein Fehler stoppt den Lauf nicht; Gesamtbild ist
  done/partial/failed mit namentlichen Fehler-Ids; Retry setzt nur Fehler zurueck.
- **Sprint 312** `lib/media-history-logic.ts`: Ergebnis-Verlauf gerenderter Medien
  pro Nutzer mit Status (rendert/fertig/fehlgeschlagen), Nutzer-Pflichtfilter,
  Optionale Status-/Art-Filter, geclammerte Pagination; Groesse bleibt solange
  rendert ehrlich "unbekannt" statt 0.
- **Sprint 313** Abschluss: Doku, CHANGELOG, Tracker-Update, Version 2.7.0,
  volle Regression (Tests + TypeCheck).

## Ehrlichkeits-Grenzen
- SRT-Zeitmarken sind Schaetzungen (keine TTS-Messung) und im Header markiert.
- Batch "partial" ist ein Ergebnis mit Fehlern, kein Erfolg.
- Verlaufs-Groessen sind erst nach Fertigstellung bekannt.

## Bekanntes Vorab-Problem (nicht aus diesen Sprints)
`tests/managed-key-rotation-integration.test.ts` (Sprint 85) ist unter paralleler
Suite-Last sporadisch flaky (~10-20 % lokal, solo stabil gruen): die Call-Zaehler
abweichender Laeufe zeigen 1 statt 2 (Provider uebersprungen) bzw. 3 statt 2
(zusaetzlicher Retry). Hypothese: Zufalls-Jitter im Exponential-Backoff
(`computeBackoffDelay`, server/_core/llm.ts) + lastabhaengige Pool-Beobachtungen
(`recordKeyObservation`). Datei-Level-Timeout (30s) ergaenzt; deterministische
Fixtur (injizierbare Clock/Jitter) ist Kandidat fuer einen Serie-D-Sprint.

**Aufgeloest (25.09.2026, Serie G):** Die Backoff-Hypothese war falsch. Echte
Ursache: Bei `isolate: false` teilen sich Testdateien den Worker-Prozess — die
Rotations-Agent-Suite (`tests/route-rotation-agent-runtime.test.ts`) hinterliess
den Modul-Spiegel `rotationPrimary` (Sprint 196) sowie `AI_GROQ_API_KEY` /
`AI_OPENROUTER_API_KEY` in der Env; die Quarantaene-Registry (`live-fix-logic.ts`)
trug zusaetzlich echte Reste. Je nachdem, welche Datei vorher im Worker lief,
sortierte `invokeLLM` die Kette um (1 statt 2 Calls) oder verlaengerte sie
(3 statt 2 Calls) — lastabhaengig, daher flaky. Fixes: Quell-Suite raeumt im
`afterAll` auf; die Sprint-85-Suite resettet Primary/Quarantaene/Env JE Test
im `beforeEach`; neuer Test-Hook `resetProviderQuarantineForTests()`.
Stressverifikation: 3x 3-Dateien-Kombination im selben Prozess gruen,
volle Suite 1.926 Tests gruen.

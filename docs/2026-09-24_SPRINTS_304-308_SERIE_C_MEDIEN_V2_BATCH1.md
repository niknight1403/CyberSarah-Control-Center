# Sprints 304–308 — Serie C: Medien v2, Batch 1 (24.09.2026)

## Sprint-Uebersicht
- **Sprint 304** `lib/byo-provider-key-logic.ts`: BYO-Key-Verwaltung mit Format-Regeln
  je Anbieter (HF/Groq/OpenRouter/Gemini/OpenAI), Maskierung (erste/letzte 4 Zeichen,
  kurze Keys voll verschleiert), Eintrags-Metadaten, Verifikations-Zustand
  (ungetestet/verifiziert/alt) — Format-Ok wird nie als Funktionieren ausgegeben.
- **Sprint 305** `lib/tts-voice-selection-logic.ts`: Stimmenauswahl pro Projekt
  (Katalog = Edge-TTS-Whitelist aus tts-logic), Praeferenz-Reihenfolge
  Id > Geschlecht > Default, Vorschau-Validierung nach TTS-Grenzen,
  deterministischer Vorschau-Cache-Key, UI-Labels.
- **Sprint 306** `lib/render-queue-logic.ts`: Render-Warteschlange mit Prioritaet+FIFO,
  Slot-Deckel (MAX_ACTIVE_RENDERS=2), ehrlicher Fortschritt NUR aus abgeschlossenen
  Szenen, ETA nur aus gemessenen Werten (sonst "ETA unbekannt" — keine Fake-Progressbar).
- **Sprint 307** `lib/scene-script-editor-logic.ts`: Manuelle Nachbearbeitung des
  deterministischen Skripts — Titel/Narration mit Clamp, Dauer-Clamp (2..30s),
  Reorder ohne Loecher, Gesamt-Dauer-Neuberechnung, Diff/Dirty gegen Baseline,
  vollstaendiger Revert.
- **Sprint 308** `lib/image-fallback-chain-logic.ts`: Fallback-Kette FLUX -> Gradient
  mit Attempt-Log (max 2 Versuche), Ergebnisklassifikation mit Pflicht-Quellen-Label:
  Gradient wird NIE als generiertes Bild deklariert, Grund immer genannt.

## Ehrlichkeits-Grenzen
- BYO-Key: Formatgueltigkeit != Funktion (Live-Test noetig).
- ETA: ohne Messdaten bewusst "unbekannt".
- Szenen-Dauer bleibt Schaetzung (heuristisch), keine Messung.

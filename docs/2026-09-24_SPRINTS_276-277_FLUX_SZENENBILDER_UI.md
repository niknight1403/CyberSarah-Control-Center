# Sprints 276–277: FLUX-Szenenbilder + Medien-Studio-UI

**Status: implementiert, getestet, produktionsbereit (24.09.2026)** — 1.539 Tests grün,
TypeScript/Lint/Build sauber.

## Sprint 276 — FLUX-Szenenbilder pro Szene

Die größte ehrliche Grenze aus Sprints 272–275 ist geschlossen: Jede Szene kann jetzt
ein echtes FLUX.1-schnell-Bild als Bühne nutzen, statt des Farbverlaufs.

- `server/image-generation.ts`: neue exportierte Funktion
  `generateSceneImageForPipeline(prompt)` — nutzt denselben FLUX-Adapter und denselben
  Bild-Cache wie die Bild-Generierung (Sprint 264), verzichtet aber auf die
  Nutzer-Quote der Bild-Funktion: Die Pipeline begrenzt sich selbst über die
  Video-Quote (6 Videos/Tag).
- `lib/video-assembly-logic.ts`: `buildSceneFfmpegArgs` kennt jetzt zwei ehrliche
  Varianten:
  1. **MIT Bild:** `-loop 1` Bild-Input, Cover-Skalierung auf 16:9
     (`scale=force_original_aspect_ratio=increase,crop=1920:1080`), dann Ken-Burns-Zoom.
  2. **OHNE Bild:** deterministische Farbverlauf-Bühne (lavfi `gradients`) als Rückfall.
- `server/media-pipeline.ts`: pro Szene wird das FLUX-Bild geholt und in das
  Arbeitsverzeichnis geschrieben; scheitert der Provider (z. B. HF_TOKEN fehlt,
  Free-Tier aufgebraucht), fällt genau DIESE Szene auf die Farbverlauf-Bühne zurück —
  der Lauf bricht nicht ab, und das Ergebnis zählt ehrlich mit:
  `sceneImages: { fluxImages, gradientFallback }` plus Klartext-Note
  ("X/Y Szenen mit echten FLUX-Bildern, Z mit Farbverlauf-Rückfall (ehrlich gezählt)").
- Der Rückfall ist deterministisch (gleicher Zustand = gleiche Entscheidung), nie ein
  stiller Austausch — das Ergebnis sagt immer, was gerendert wurde.

## Sprint 277 — Medien-Studio (Frontend-UI)

Neuer Screen `app/(tabs)/media-studio.tsx` (registriert im Tab-Layout, Icon "video.fill"):

- **Status-Karte:** `mediaPipeline.status` — ffmpeg-Verfügbarkeit und alle Limits
  (Szenen, Dauer, Tagesquote) sichtbar; ohne ffmpeg steht "OHNE FFMPEG" ehrlich da,
  und der Render-Button bleibt gesperrt statt ins Leere zu laufen.
- **Formular:** mehrzeiliger Quelltext-Input mit Zeichenzähler, Stimmen-Auswahl
  (Whitelist der vier deutschen Edge-TTS-Stimmen als Chips), ausdrückliche
  Freigabe-Checkbox ("verbraucht Tagesquote") — ohne Freigabe kein Render.
- **Ergebnis:** Szenenzahl, Dauer, Cache-vs-frisch, ehrliche Note inkl. FLUX/Farbverlauf-
  Zählung; auf dem Web-Export läuft ein eingebetteter `<video controls>`-Player mit dem
  Ergebnis. Native-Apps zeigen einen Download-Hinweis (ehrlich statt kaputtem Player).
- **Fehler:** jede Fehlerantwort mit `reason` und `retryHint` wird vollständig angezeigt,
  nichts wird verschluckt oder beschönigt.

## Ehrlichkeits-Grenzen (bewusst dokumentiert)

1. **FLUX-Bilder hängen vom Free-Tier ab:** Ohne `HF_TOKEN` oder bei erschöpftem
   Kontingent rendert die Pipeline Farbverlauf-Bühnen — sichtbar und gezählt.
2. **Szenenbilder sind statisch:** Ken-Burns-Zoom über ein Standbild pro Szene, keine
   generierten Bewegtbilder (Video-Diffusion ist bewusst kein Free-Tier-Versprechen).
3. **Video-Größe:** bis 24 MB als dataUrl im Antwort-Payload — für Desktop-Web okay,
   auf Mobilfunk merklich; Download-/Streaming-Auslieferung ist eine spätere Stufe.
4. **Timing bleibt Schätzung** (~15 Zeichen/Sekunde), wie in Sprints 272–275 dokumentiert.

## Testabdeckung (Neu in diesem Batch)

- `tests/video-assembly-logic.test.ts` (+2): Bild-Variante der ffmpeg-Argumente,
  deterministischer Farbverlauf-Rückfall
- `tests/media-pipeline-logic.test.ts` (+3): FLUX je Szene gezählt, Rückfall bei
  Provider-Fehler, gemischte Läufe (FLUX + Rückfall) ehrlich gezählt

Gesamt: 1.539 Tests grün (181 Dateien).

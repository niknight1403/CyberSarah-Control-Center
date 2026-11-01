# Sprints 272–275: Multimodale Medien-Pipeline (Port aus projekt-nullpunkt)

**Status: implementiert, getestet, produktionsbereit (24.09.2026)** — 1.534 Tests grün,
TypeScript/Lint/Build sauber.

## Was gebaut wurde

Die größte Produktlücke aus der Repo-Adoption-Analyse ist geschlossen: CyberSarah kann
jetzt aus deutschem Text ein vollständiges 1080p-Video mit deutscher Sprachausgabe und
Untertiteln erzeugen — komplett auf kostenloser Infrastruktur.

### Sprint 272 — TTS (Text-zu-Sprache, Edge-TTS)
- `lib/tts-logic.ts` (rein, testbar): Whitelist deutscher Stimmen
  (Default: de-DE-KatjaNeural), Textlimit 1.500 Zeichen, deterministischer Cache-Schlüssel,
  Cache-Orchestrierung mit ehrlicher Quellen-Angabe (`cache` vs. `provider`).
- `server/tts.ts`: echter Provider über **msedge-tts** (Node-Client, WebSocket gegen
  Microsofts öffentliche Edge-Endpunkte) — kein Python, keine CLI, keine API-Key-Kosten.
  Temp-Dateien werden nach jedem Lauf aufgeräumt.

### Sprint 273 — Szenen-Manuskript (aus projekt-nullpunkt portiert)
- `lib/scene-script-logic.ts`: deterministische Zerlegung in max. 8 Szenen (kein LLM —
  gleicher Text = gleiches Manuskript), geschätzte Timing-Dauern (als Schätzung
  gekennzeichnet), plus **synthetisch-only Safety-Gate**: Eingaben zu realen Personen,
  Deepfakes, Minderjährigen oder expliziten Inhalten werden VOR allem anderen abgelehnt.
- Überschuss-Sätze werden auf die letzte Szene verteilt — nichts geht still verloren.
- SRT-Untertitel-Builder (rein, deterministisch).

### Sprint 274 — Video-Assembly (FFmpeg) + Laufzeitumgebung
- `lib/video-assembly-logic.ts`: reine ffmpeg-Argument-Builder — pro Szene ein
  synthetischer Farbverlauf (lavfi `gradients`) mit Ken-Burns-Zoom, dann Concat aller
  Szenen mit eingebrannten Untertiteln, 1080p/25fps, `+faststart`.
- **Dockerfile**: `ffmpeg` ist jetzt Teil des Runtime-Images. Ohne dieses Binary meldet
  der Fähigkeits-Check (`probeFfmpeg`) ehrlich "nicht verfügbar" — kein stiller
  Audio-only-Ersatz, der sich als Video ausgibt.

### Sprint 275 — Orchestrierung + Router
- `server/media-pipeline.ts`: kompletter Lauf (Text → Manuskript → TTS pro Szene →
  ffmpeg-Assembly → MP4), Arbeitsverzeichnis wird in jedem Fall aufgeräumt,
  Tagesquote 6 Videos/Nutzer, Cache über Settings-KV (identischer Text + Stimme =
  identisches Video, sichtbar in der Antwort).
- `server/media-pipeline-router.ts` (tRPC, registriert als `mediaPipeline`):
  - `status` — ehrlicher Fähigkeits-Status (ffmpeg vorhanden? Limits?)
  - `tts` — einzelne Sprach-Synthese
  - `generate` — kompletter Video-Render, **nur mit ausdrücklicher Freigabe** (`approved: true`)

## Ehrlichkeits-Grenzen (bewusst dokumentiert)

1. **Visuelle Ebene = Farbverläufe, nicht FLUX-Bilder.** Die Bühne jeder Szene ist ein
   synthetischer Gradient mit Ken-Burns-Zoom. Das Video-Modul ist bewusst nicht an die
   Bild-Generierung (Sprint 264) gekoppelt — echte FLUX-Szenenbilder sind die nächste
   Stufe, kein Teil dieses Versprechens.
2. **Timing ist eine Schätzung.** Szenendauern basieren auf ~15 Zeichen/Sekunde, nicht
   auf gemessener Audiolänge. Die Untertitel folgen der Schätzung; bei sehr schnellem
   oder langsamem Sprecher verschoben, aber nie unlesbar.
3. **Audio-Codierung:** TTS liefert 24kHz/48kbps MP3; im Video auf AAC 128k
   transcodiert — hörbar gut, nicht Studioqualität.
4. **Kosten:** Edge-TTS und ffmpeg sind kostenlos. Quoten (30 TTS/Tag, 6 Videos/Tag
   pro Nutzer) schützen trotzdem vor Missbrauch und Render-Staus auf dem Free-Tier.

## Produktions-Verifikation (nach Deploy)

- `GET /api/health` → `{"ok":true}` bleibt Pflicht.
- ffmpeg-Verfügbarkeit im Container: der `mediaPipeline.status`-Endpoint meldet sie
  ehrlich; ein erster Test-Render in Produktion steht als eigene Prüfung aus.

## Testabdeckung

- `tests/tts-logic.test.ts` (7 Tests): Validierung, Cache, Fehler-Weitergabe
- `tests/scene-script-logic.test.ts` (7 Tests): Safety-Gate, Zerlegung, SRT
- `tests/video-assembly-logic.test.ts` (7 Tests): ffmpeg-Argumente, Concat, Grenzen
- `tests/media-pipeline-logic.test.ts` (5 Tests): Orchestrierung mit injizierten Fakes,
  Freigabe-Pflicht, Fehler-Pfade

Gesamt: 1.534 Tests grün (181 Dateien).

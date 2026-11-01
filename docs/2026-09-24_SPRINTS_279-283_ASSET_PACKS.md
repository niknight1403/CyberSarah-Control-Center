# Sprints 279–283: Asset-Packs (Outfit & Sets) — Modul, Pipeline, UI

**Status: implementiert, getestet, produktionsbereit (24.09.2026)** — 1.560 Tests grün,
TypeScript/Lint/Build sauber.

## Was gebaut wurde

Die Outfit-/Sets-Packs existierten bislang als Konzept ohne Code. Jetzt sind sie ein
vollständiges Modul, das die Content-Kreations- und Rendering-Pipeline ehrlich erweitert:

- **Sprint 279 — Pure Logic (`lib/asset-packs-logic.ts`):** Validierung (Name, 1–5
  Prompt-Modifikatoren, Hex-Rückfall-Farben), deterministische Auswahl (genau ein
  aktives Outfit- und Sets-Pack), Prompt-Komposition mit 900-Zeichen-Cap, rotierende
  Gradient-Farben pro Szene, Cache-Signatur.
- **Sprint 280 — Persistenz & API (`server/asset-packs.ts`, `asset-packs-router.ts`):**
  Nutzer-scoped KV-Speicherung (max. 12 Packs), tRPC-Router `assetPacks`
  (list/create/activate/remove/status). Aktivieren eines Packs deaktiviert ältere
  aktive Packs derselben Art — deterministisch, nie zwei aktive Outfits gleichzeitig.
- **Sprint 281/282 — Pipeline-Integration:** `renderVideoRun` akzeptiert aktive Packs;
  die FLUX-Szenenbilder bekommen Outfit-/Sets-Modifikatoren, und der Farbverlauf-Rückfall
  nutzt die Pack-Farben (rotierend, damit beide Packs sichtbar bleiben). Der Video-Cache-Key
  enthält die Pack-Signatur — ein gecachtes Video wird nie mit den falschen Packs
  ausgeliefert. Das Ergebnis-Note nennt die gewirksamen Packs ehrlich.
- **Sprint 283 — UI:** Medien-Studio zeigt die für den nächsten Render wirksamen Packs,
  verwaltet alle Packs (An/Aus/Löschen) und legt neue an (Art, Name, Modifikatoren,
  Rückfall-Farben).

## Gefundener und gefixter Bug (Sprint 276, ehrlich dokumentiert)

Der Produktions-`FfmpegAssembler` hat `imagePath` beim Aufruf von
`buildSceneFfmpegArgs` verworfen — FLUX-Szenenbilder wären in Produktion **nie**
gerendert worden, jede Szene wäre still auf die Farbverlauf-Bühne gefallen. Die
Unit-Tests prüften den Builder direkt und merkten es nicht. Gefixt und durch einen
integrierenden Test abgesichert.

## Ehrlichkeits-Grenzen

1. Pack-Modifikatoren wirken nur auf FLUX-Bilder; fällt FLUX aus, wirken nur die
   Pack-Rückfall-Farben auf der Gradient-Bühne. Beides wird im Ergebnis gezählt.
2. Ein-Pack-pro-Art ist bewusst: mehrere aktive Outfits wären nichtdeterministisch.
3. KV-Speicherung ohne Versionsverlauf/Undo — Packs sind Konfiguration, keine Buchhaltung.

## Testabdeckung (Neu: 15 Tests)

- `tests/asset-packs-logic.test.ts` (12): Validierung, Auswahl, Prompt-Cap, Gradient-Rotation,
  Persistenz-Parsing, Cache-Signatur
- `tests/asset-packs-service.test.ts` (3): CRUD mit genau-ein-aktiv-pro-Art, Grenzen (12 Packs), Fehler
- `tests/video-assembly-logic.test.ts` (+3): Pack-Farben im ffmpeg-Gradient, Legacy-Rückfall,
  Cache-Key-Trennung

Gesamt: 1.560 Tests grün (183 Dateien).

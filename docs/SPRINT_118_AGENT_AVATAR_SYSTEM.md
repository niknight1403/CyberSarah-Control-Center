# Sprint 118 — Agent-Avatar-System (prozedural animiert)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 763/763 Tests grün, Server-Build erfolgreich

## Ziel

Prozedural animierte Avatare (React Native), inspiriert vom Tech-Scan-Fund `karacca/moodstone` (Relevanz 14, höchster Fund) — passt zum Living-AI-Interface (Sprint 89).

## Umsetzung

### Reine Logik — `lib/agent-avatar-logic.ts`

- **Identität aus Seed:** `avatarSeedFromName` (FNV-1a, 32 Bit) macht den Avatar zur Identität — gleicher Name, gleicher Avatar, für immer, kein Zufall pro Start.
- **Geometrie:** `createAvatarGeometry` (deterministisch via mulberry32, jetzt exportiert aus der Sprint-89-Logik): 2–3 Ringe (von innen nach außen sortiert, Radius 20–46 %, Sweep 40–320°, Drehrichtung ±1), 4–8 Blüten-Segmente (Winkel fest in 0–359 gewrappt und aufsteigend sortiert), Kern-Radius 18–30 %, Farbversatz 0–359°.
- **Stimmungen:** `idle / thinking / speaking / success / error` mit Animations-Parametern — Design-Regeln des Owners umgesetzt: ruhige Grundanimation (Atem ≥ 1,6 s, idle rotiert langsam), Glow NUR bei wichtigen Zuständen (idle 0, thinking ≤ 0,3, success/error > 0,3), Fehlerzustand rotiert rückwärts als Unterscheidungsmerkmal.
- **SVG-Pfad:** `buildRingArcPath` — deterministischer M/A-Bogen, large-arc-flag korrekt über 180°; Grundlage für die Ring-Darstellung und künftige Exporte.
- **Stimmungs-Ableitung:** `resolveAvatarMood` — Fehler schlägt alles, Denken schlägt Erfolg, sonst ruhig.

### Komponente — `components/living/agent-avatar.tsx`

Reanimated: atmender Kern (withRepeat-Timing, Stimmungs-Amplitude/-Dauer), linear rotierende Ringe (Richtung aus der Stimmung), Blüten-Segmente aus der Geometrie, Glow über Schatten-Intensität aus `AVATAR_MOOD_ANIMATION`. Farbnuance: `shiftHue(colors.tint, hueOffset)` — seed-stabil, aber im Theme-Farbraum. Accessibility-Label mit Name und Stimmung.

### Farb-Hilfe — `lib/theme-color-utils.ts`

`shiftHue`: reine Hex→HSL→Hex-Drehung (0–359°, wrap-around); Graustufen bleiben unangetastet (Sättigung 0).

### Integration — `app/(tabs)/agent.tsx`

Der Chat-Hero zeigt statt des statischen Icons den prozeduralen Avatar von „CyberSarah" (64 dp), Stimmung live aus dem Chat-Zustand abgeleitet (`isThinking`, `chatError` → thinking/error).

## Tests (14 neu) — und was sie wirklich fingen

- Seed-Stabilität (Identität, keine Zufalls-Werte), Geometrie-Grenzen (Ringe sortiert, Radien/Sweeps, Blüten-Winkel sortiert, Kern/Hue im Rahmen) — **die Tests fingen zwei echte Logik-Bugs**: Ring-Radius konnte 48 statt max. 46 erreichen und Blüten-Winkel konnten negativ werden (Sortier-Bruch); beide sind gefixt und durch die Suite abgesichert.
- Design-Regeln: Atem-Dauer-Untergrenze, Glow-Verteilung, plausible Amplituden/Rotationen.
- SVG-Pfad: Determinismus, M/A-Format, large-arc-flag — ein Test deckte einen Erwartungsfehler auf (Radius ist Prozent der Größe), korrigiert.
- Stimmungs-Ableitung (Priorität Fehler > Denken > Erfolg) und Normalisierung (unbekannt → idle).

## Ehrliche Grenzen (dokumentiert)

- Ein Avatar (Master-Agent) ist integriert; die Geometrie ist bereits multi-agent-fähig (Seed je Name) — weitere Avatare folgen, wenn Sub-Agenten eine eigene Nutzeroberfläche bekommen.
- Die Blüten sind stilisierte Flächen, keine morphologischen SVG-Formen; `avatarRingPaths` legt die Export-Grundlage, ohne jetzt einen SVG-Renderer einzubauen.

## Nächste Schritte (Sprint 119)

Offline-Pufferung des Daten-Hubs: letzte Dashboard-Daten lokal cachen, Sync bei Reconnect — baut auf den Realgerät-Erkenntnissen aus Sprint 107 auf.

# Sprint 117 — Onboarding-Verbesserung (Willkommensflow + Theme-Auswahl)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 749/749 Tests grün, Server-Build erfolgreich

## Ziel

Willkommensflow beim ersten Start mit Theme-Auswahl — UI-Inspiration: liquid-glass-Welcome-Screens aus dem Tech-Scan. Bestandsinstallationen starten unverändert direkt in den Tabs.

## Umsetzung

### Reine Logik — `lib/onboarding-logic.ts`

- **Abschluss-Flag:** Storage-Key `cybersarah.onboarding.v1`; nur exakt `true` gilt als abgeschlossen — ohne Guess-Logik (eine einmal abgeschlossene Installation sieht den Flow nie wieder).
- **Slides:** drei feste deutsche Schritte — Begruessung → Workspace → Theme-Auswahl.
- **`clampOnboardingStepIndex` / `getOnboardingStepState`:** Schritt-Zustaende (Fortschritt 0..1, erster/letzter Schritt, Button-Label „Weiter" vs. „Los geht's"); ungueltige Indizes werden geclampt statt abzustuerzen, Ein-Slide-Flows sind first-und-last gleichzeitig.
- **Kuratierte Theme-Auswahl:** vier unterscheidbare Designs (Living AI Interface, Aurora Glass, Cyber Obsidian, Neon Rose) statt aller neun — Standard-Design zuerst; unbekannte Wahlen fallen auf das Standard-Design zureck. Rest bleibt im Theme-Lab/Konto-Tab.
- **`shouldCompleteOnboarding`:** Abschluss nur auf dem letzten Schritt MIT Design-Wahl — die Praeferenz (hell/dunkel/system) hat einen sicheren Default.

### Hook — `hooks/use-onboarding.ts`

AsyncStorage-gestuetztes Abschluss-Flag mit `checking`-Phase (kein Flackern zwischen Tabs und Onboarding), Lesefehler fuehren ehrlich zum einmaligen Angebot des Flows statt einer Endlosschleife.

### Screen — `app/onboarding.tsx`

Liquid-glass-inspiriert: LinearGradient-Hintergrund, Milchglas-Karten mit Tint-Glow und Blur-Rand (withAlpha auf Palette), animierte Fortschritts-Punkte, Reanimated-Fade-Uebergaenge je Slide. Theme-Slide: Design-Karten mit Icon/Beschreibung + Praeferenz-Chips (System/Hell/Dunkel); „Los geht's" ist ohne Design-Wahl ehrlich deaktiviert. Abschluss schreibt Design + Praeferenz ueber den ThemeProvider und `replace` zu den Tabs — kein Zurueck aus der App.

### Gate — `app/(tabs)/_layout.tsx`

Der Tab-Einstieg prueft das Flag: Status `incomplete` leitet einmalig per `router.replace("/onboarding")` in den Flow; `checking` und `complete` rendern normal. Bestandsinstallationen (Flag gesetzt oder nie gesetzt aber bestaetigt) starten direkt in den Tabs.

### Root-Stack

`Stack.Screen name="onboarding"` registriert (headerShown bleibt false, konsistent zum Rest).

## Tests (11 neu)

- Flag-Normalisierung (nur exakt „true"), Slide-Reihenfolge, Schritt-Zustaende (Fortschritt, Labels, Clamping inkl. NaN/Ein-Slide).
- Theme-Auswahl: vier unterscheidbare Registry-Designs, Standard zuerst, unbekannte Wahl → Standard-Fallback.
- Praeferenz-Normalisierung/-Labels, Abschluss-Entscheidung (letzter Schritt + Design-Wahl beide noetig).

## Ehrliche Grenzen (dokumentiert)

- Der Flow ist bewusst minimal: kein Login/Workspace-Setup im Onboarding — Konto-Anbindung bleibt wie bisher im Konto-Tab, der Workspace-Slide verweist darauf.
- Die Design-Vorschau zeigt Beschreibung + Icon, keine Live-Vorschau der Palette — Live-Umschalten waere moeglich, wurde aber bewusst nicht implementiert, damit der Flow schnell abgeschlossen werden kann.

## Naechste Schritte (Sprint 118)

Agent-Avatar-System: prozedural animierte Avatare (React Native), inspiriert vom Tech-Scan-Fund `karacca/moodstone` (Relevanz 14, hoechster Fund) — passt zum Living-AI-Interface (Sprint 89).

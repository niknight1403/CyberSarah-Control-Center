# Sprints 349–353: Serie G Rest + Abschluss (Mobile-App-Politur)

**Datum:** 25.09.2026
**Batch:** 14 (Serie G Rest + Abschluss)
**Status:** ERLEDIGT (100% grün)
**Teststand:** 2.021 Tests grün in 255 Testdateien (+34 neue Tests)

---

## Umgesetzte Sprints & Highlights

### 1. Sprint 349: Android Predictive Back + Rückabwicklungs-Animationen
- **Modul:** `lib/predictive-back-logic.ts`
- **Tests:** `tests/predictive-back-logic.test.ts`
- **Funktion:** Lifecycle für Android 13/14+ Predictive Back Gesten (`started`, `progress`, `completed`, `cancelled`). Berechnet Karten-Skalierung (1.0 -> 0.90), Abrundungsradien (0 -> 16px) und Opazität sowie vertikale Offsets für Modals. Prüft Haptik-Schwellenwert (35%) und Handhabung bei App-Exit.
- **Ehrlichkeits-Grenze:** Hardware-Predictive-Back setzt Android API Level >= 33 voraus; auf älteren Android-Versionen oder Web läuft ein Fallback ohne System-Vorschau-Layer.

### 2. Sprint 350: Tastatur-Handling: Chat-Eingabe, Formulare, kein Overlay-Verstecken
- **Modul:** `lib/keyboard-handling-logic.ts`
- **Tests:** `tests/keyboard-handling-logic.test.ts`
- **Funktion:** Inset- & Sichtbarkeitssteuerung für Tastatureinblendungen. Berechnet minimale Scroll-Offsets (`requiredScrollY`), damit aktive Eingabefelder nicht verdeckt werden, positioniert Chat-Toolbars direkt über der Tastatur und steuert Fokus-Sequenzen (`next`/`previous`).
- **Ehrlichkeits-Grenze:** Auf Mobile Web basiert die Tastatur-Höhenerkennung auf `visualViewport` / Window-Resize; bei ungenauen Plattform-Insets greift ein konfigurierbarer Sicherheitsabstand (`extraPadding`).

### 3. Sprint 351: Tablet-Layout: Zwei-Spalten-Designs auf breiten Screens
- **Modul:** `lib/tablet-layout-logic.ts`
- **Tests:** `tests/tablet-layout-logic.test.ts`
- **Funktion:** Responsive Breakpoint-Klassifizierung (`phone`, `tablet_portrait`, `tablet_landscape`, `desktop`). Steuert Master-Detail Spaltenaufteilung, berechnet Spaltenbreiten (mit Schutz für `minDetailWidthPx`) und verwaltet Einklappzustände und Pane-Routen.
- **Ehrlichkeits-Grenze:** Schmale Bildschirme (< 768px) erzwingen Ein-Spalten-Layout; Zwei-Spalten-Modus erfordert ausreichende Breite für die Detailspalte (>= 400px).

### 4. Sprint 352: App-Icon/Splash-Politur + Store-Screenshots-Doku erneuern
- **Modul:** `lib/app-icon-splash-logic.ts`
- **Tests:** `tests/app-icon-splash-logic.test.ts`
- **Funktion:** Lebenszyklussteuerung für den Splash-Screen (`minDisplayMs` Schutz gegen Flackern, `maxTimeoutMs` Fallback bei Hängern). Validiert Icon-Asset-Spezifikationen (Master 1024x1024, Adaptive Icon) und generiert Store-Screenshot-Checklisten für App Store & Google Play.
- **Ehrlichkeits-Grenze:** Natives Ausblenden nutzt die Expo/Capacitor-Bridge; Store-Screenshots erfordern physische Captures oder Simulator-Export.

### 5. Sprint 353: Serie-G-Abschluss: Doku + Validierung + CHANGELOG
- **Modul:** `lib/serie-g-validation-logic.ts`
- **Tests:** `tests/serie-g-validation-logic.test.ts`
- **Funktion:** Automatische Qualitäts- und Abdeckungsprüfung für alle 10 Sprints der Serie G (Sprints 344–353), Verifikation der Ehrlichkeits-Grenzen und Generierung des Serie-G-Abschlussberichts.
- **Ehrlichkeits-Grenze:** Validiert Logikmodule und Akzeptanzkriterien; Produktion-Deploys und APK-Releases werden durch den Koordinator veranlasst.

---

## Serie-G Gesamtbilanz (Sprints 344–353)

| Sprint | Thema | Modul | Zustand |
|---|---|---|---|
| 344 | Navigation-Pass (Tab-Stacks, Deep-Links) | `lib/navigation-logic.ts` | ✅ ERLEDIGT |
| 345 | Offline-Zustände (Connectivity, Reconnect-Plan) | `lib/offline-connectivity-logic.ts` | ✅ ERLEDIGT |
| 346 | Lade-Erlebnis (Skeleton-Presets) | `lib/skeleton-loading-logic.ts` | ✅ ERLEDIGT |
| 347 | Push-Benachrichtigungen (Lokale Trigger) | `lib/local-notifications-logic.ts` | ✅ ERLEDIGT |
| 348 | APK-Größe + Startzeit-Metriken | `lib/apk-size-metrics-logic.ts` | ✅ ERLEDIGT |
| 349 | Android Predictive Back & Animationen | `lib/predictive-back-logic.ts` | ✅ ERLEDIGT |
| 350 | Tastatur-Handling & Focus-Scrolling | `lib/keyboard-handling-logic.ts` | ✅ ERLEDIGT |
| 351 | Tablet-Layout & Dual-Pane Master-Detail | `lib/tablet-layout-logic.ts` | ✅ ERLEDIGT |
| 352 | App-Icon, Splash & Store Screenshots | `lib/app-icon-splash-logic.ts` | ✅ ERLEDIGT |
| 353 | Serie-G-Abschluss & Validierung | `lib/serie-g-validation-logic.ts` | ✅ ERLEDIGT |

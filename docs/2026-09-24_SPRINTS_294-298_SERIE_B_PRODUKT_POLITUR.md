# Sprints 294–298: Serie B — Produkt-Politur & i18n (Batch 3)

**Datum:** 24.09.2026 · **Status:** ERLEDIGT · **Tests:** 1.589 → 1.684 (+95) · **Dateien:** 192 → 197

## Sprint 294: EN-Sprach-Toggle vollständig
- Vollständiges i18n-System mit Deutsch/Englisch-Wörterbuch (`lib/i18n-language-logic.ts`)
- Sprach-Normalisierung (Storage-Wert → gültige Sprache), Toggle, Persistenz-Helfer
- 42 UI-Keys in beiden Sprachen übersetzt, createTranslator() Helper für UI-Komponenten
- **Ehrliche Grenze:** Nur statische UI-Labels werden übersetzt. Dynamische Texte (Chat-Antworten, Provider-Fehlermeldungen) bleiben in der Originalsprache.

## Sprint 295: Onboarding v2 — Geführter erster Lauf
- 3-Schritt-Onboarding mit ehrlichen Erwartungen (`lib/onboarding-v2-logic.ts`)
- Schritt 1: "Was CyberSarah kann" mit Beta-Kennzeichnung für KI-Features
- Schritt 2: "Deine ersten Einstellungen" — ehrlich: ohne Repo sind Workspace-Tools nicht nutzbar
- Schritt 3: "Bereit zum Start" — ehrlich: Medien-Studio/Stripe brauchen额外 Konfiguration
- V1-Migrations-Helfer: Bestandskunden überspringen v2 automatisch
- **Ehrliche Grenze:** Jeder Schritt hat einen `honestLimit`-Text, der Einschränkungen nennt.

## Sprint 296: Template-Galerie erweitern
- 7 Starter-Templates mit 4 Kategorien (blank, dashboard, chat, media) (`lib/template-gallery-logic.ts`)
- Kategorie-Filter (rein, deterministisch), Badges mit Kategorie-Zähler
- Mindestens 5 Templates (Anforderung erfüllt: 7)
- **Ehrliche Grenze:** Templates sind Starter-Skelette. Was enthalten ist und was fehlt, wird pro Template ehrlich im `honestLimit`-Feld beschrieben.

## Sprint 297: Chat-Leerer-Zustand
- 4 Starter-Prompts statt weißer Fläche (`lib/chat-empty-state-logic.test.ts`)
- Repo-abhängige Prompts werden bei fehlendem Repo als deaktiviert markiert — NIEMALS versteckt
- Hinweis-Text für deaktivierte Prompts: "Verbinde zuerst ein Repository"
- **Ehrliche Grenze:** Deaktivierte Prompts bleiben sichtbar, damit Nutzer weiß, was möglich wäre. Die Aktion kann leer ausgehen, wenn der Kontext fehlt.

## Sprint 298: Fehlerbildschirme — Sprechende Fallbacks
- Fehlerklassifikation (network, render, auth, data, unknown) (`lib/error-fallback-logic.ts`)
- Release/Admin-Build: sprechender Fallback-Text, keine Stacktraces, keine internen Pfade
- Dev-Build: erweiterte Diagnose erlaubt
- Auth-Fehler → kein Retry (Login-Redirect statt Fallback)
- **Ehrliche Grenze:** Der Fallback-Text nennt die Fehlerklasse, aber niemals Dateipfade, Stacktrace-Zeilen oder sensible Interna. Der Nutzer erfährt genug zum Handeln, nicht genug zum Angreifen.

## Test-Statistik
- Vorher: 1.589 Tests in 192 Testdateien
- Nachher: 1.684 Tests in 197 Testdateien (+95 Tests, +5 Dateien)
- TypeScript: keine neuen Fehler
- Vollständige Suite: 197/197 grün

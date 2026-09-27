# Sprints 364–368: Serie I (Agent-Intelligenz — Batch 17)

**Datum:** 26.09.2026
**Batch:** 17 (Serie I: Agent-Intelligenz)
**Status:** ERLEDIGT (100% grün)
**Teststand:** 2.274 Tests grün in 291 Testdateien (+22 neue Tests, +5 Testdateien)

---

## Umgesetzte Sprints & Highlights

### 1. Sprint 364: Prompt-Versionierung + A/B-Vergleichsmetrik
- **Modul:** `lib/prompt-versioning-ab-logic.ts`
- **Tests:** `tests/prompt-versioning-ab-logic.test.ts`
- **Funktion:** Versionierung von Prompt-Varianten, Erfassung detaillierter Ausführungsmetriken (Erfolgsrate, Qualitäts-Score, p95 Latenz, Token-Verbrauch) und A/B-Test-Auswertung (`evaluateABTest`) mit konfigurierbaren Stichproben-Mindestgrößen und statistischen Signifikanzschwellen sowie deterministischem Traffic-Splitting (`selectVariantForTraffic`).
- **Ehrlichkeits-Grenze:** Bei unzureichender Stichprobengröße wird kein Gewinner deklariert, sondern ehrlich der Zustand `insufficient_data` zurückgemeldet.

### 2. Sprint 365: Selbst-Kritik-Schritt: Lösung gegen Akzeptanzkriterien prüfen
- **Modul:** `lib/agent-self-critique-logic.ts`
- **Tests:** `tests/agent-self-critique-logic.test.ts`
- **Funktion:** Deterministische Lösungsevaluierung gegen definierte Akzeptanzkriterien (Schlüsselwörter, Regex-Muster, Wortanzahlen). Berechnet Gesamterfüllungs-Scores und generiert gezielte Nachbesserungshinweise für fehlgeschlagene Kriterien vor Task-Abschluss.
- **Ehrlichkeits-Grenze:** Werden kritische Pflichtkriterien verfehlt, empfiehlt der Agent eine Überarbeitung statt die Aufgabe fälschlicherweise als bestanden zu deklarieren.

### 3. Sprint 366: Werkzeug-Auswahlstatistik: Nutzung messen, Nie-Nutzung ehrlich räumen
- **Modul:** `lib/tool-usage-stats-logic.ts`
- **Tests:** `tests/tool-usage-stats-logic.test.ts`
- **Funktion:** Messung und Analyse von Werkzeugaufrufen, Erfolgsquoten und Ausführungszeiten. Identifiziert ungenutzte Werkzeuge ("Nie-Nutzung") und berechnet konkrete Token-Einsparungen im System-Prompt.
- **Ehrlichkeits-Grenze:** Nur ungenutzte Nicht-Kern-Werkzeuge können automatisch deaktiviert werden; geschützte Kern-Werkzeuge (z. B. `bash`, `read_file`) verbleiben immer aktiv.

### 4. Sprint 367: Gedächtnis-Konsolidierung v2: Wichtiges bleibt, Vermengtes ordnen
- **Modul:** `lib/agent-memory-consolidation-v2-logic.ts`
- **Tests:** `tests/agent-memory-consolidation-v2-logic.test.ts`
- **Funktion:** Automatische Strukturierung und Kategorisierung unstrukturierter Gedächtniseinträge (`UserPreference`, `ProjectRules`, `SystemArchitecture`, `EphemeralTaskState`). Führt Duplikate zusammen und löst Konflikte zugunsten vom Nutzer bestätigter oder neuerer Einträge, während veraltete flüchtige Zustände sicher abgeräumt werden.
- **Ehrlichkeits-Grenze:** Nutzerbestätigte Regeln und Kernpräferenzen werden niemals automatisch gelöscht oder überschrieben.

### 5. Sprint 368: Aufgaben-Zerlegung: große Ziele in prüfbare Teilschritte
- **Modul:** `lib/task-decomposition-logic.ts`
- **Tests:** `tests/task-decomposition-logic.test.ts`
- **Funktion:** Zerlegung komplexer Hauptziele in prüfbare Teilschritte mit expliziten Akzeptanzkriterien, Abhängigkeitsgraphen und topologischer Ausführungsreihenfolge. Verfolgt den Ausführungsfortschritt und propagiert Fehler automatisch als Blockaden in abhängige Schritte.
- **Ehrlichkeits-Grenze:** Vage oder unkonkrete Zielformulierungen werden frühzeitig erkannt und mit der Bitte um Präzisierung zurückgewiesen, statt fehlerhafte Pläne zu erzeugen.

---

## Batch-17 Übersicht (Sprints 364–368)

| Sprint | Thema | Modul | Zustand |
|---|---|---|---|
| 364 | Prompt-Versionierung + A/B-Vergleichsmetrik | `lib/prompt-versioning-ab-logic.ts` | ✅ ERLEDIGT |
| 365 | Selbst-Kritik-Schritt | `lib/agent-self-critique-logic.ts` | ✅ ERLEDIGT |
| 366 | Werkzeug-Auswahlstatistik | `lib/tool-usage-stats-logic.ts` | ✅ ERLEDIGT |
| 367 | Gedächtnis-Konsolidierung v2 | `lib/agent-memory-consolidation-v2-logic.ts` | ✅ ERLEDIGT |
| 368 | Aufgaben-Zerlegung | `lib/task-decomposition-logic.ts` | ✅ ERLEDIGT |

# Sprint 113 — Memory-Konsolidierung (Sleep-Time)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, Suite grün, Server-Build erfolgreich

## Ziel

Das Langzeit-Gedächtnis des Master-Agenten (Sprint 94, `agentLearnings`) von reinem Ansammeln zu gepflegtem Wissen weiterentwickeln: nächtliche Konsolidierung, messbare Retrieval-Qualität und eine Admin-Sicht auf den Bestand. Anregung: Tech-Scan-Fund `tigerless-labs/agent-memory` (Sleep-Time-Computing).

## Umsetzung

### Reine Konsolidierungs-Logik — `lib/agent-memory-consolidation-logic.ts`

- **Merge-Gruppen:** Union-Find über Paar-Ähnlichkeit — Keyword-Overlap (Jaccard ≥ 0.6) ODER Titel-Ähnlichkeit (≥ 0.8, nur bei inhaltsvollen Titeln mit ≥ 3 Sinnwörtern, damit generische Titel wie „Learning 3" nicht grundlos verschmelzen). Träger ist der älteste Eintrag (Chronologie bleibt erhalten); er erbt die vereinigten Keywords (gekappt auf das Prompt-Budget aus Sprint 94).
- **Veraltung:** Interaktions-Learnings, die älter als 120 Tage sind UND keine Keywords UND kaum Substanz (< 25 Zeichen Detail) tragen, fallen als Rauschen weg. Fehlerbehebungs- und Entscheidungswissen altert bewusst nie weg. Merge-Träger werden nach der Zusammenführung nicht mehr als Rauschen invalidiert (sie erben Keywords).
- **Widersprüche:** Gleiches Thema mit gegenläufiger Polarität (Negativ-Marker wie „kaputt/blockiert/down" vs. Positiv-Marker wie „behoben/gefixt/funktioniert") wird **markiert, nie gelöscht** — der Admin entscheidet. Ausgabe: Paar (neuere ID, ältere ID) + tokenfreie Notiz.
- **Konservativ-Prinzip:** Nur eindeutige Duplikate und klares Rauschen werden entfernt; jeder Plan ist deterministisch aus den Regeln ableitbar — kein LLM, kein externer Key.

### Server & Metriken

- `server/memory-consolidation.ts` — Orchestrierung: Bestand laden → Plan bauen → anwenden (Traeger-Keywords updaten, wegfallende Learnings löschen) → Lauf protokollieren. `dryRun` für Admin-Vorschau ohne Schreibzugriffe.
- `server/retrieval-metrics.ts` — Rolling Retrieval-Metriken (prozess-lokal, max. 500 Stichproben, 24-h-Fenster): Nach jedem Turn mit injizierten Learnings wird die nächste Nutzer-Nachricht derselben Session gegen die injizierten Keywords geprüft — wiederverwendetes Wissen zählt als Treffer. Ehrlich: Ein Server-Neustart setzt den Rollingspeicher zurück (Betriebsstatistik, keine Nutzerdaten).
- `server/db.ts` — DB-Zugriffe: Gesamten Bestand laden, letzten Lauf lesen, Lauf protokollieren, Plan anwenden (idempotente Einzelstatements).
- `server/memory-router.ts` — Admin-geschützte tRPC-Prozeduren: `memory.overview` (Bestandsgröße, letzter Lauf, Retrieval-Metriken) und `memory.consolidate` (manuelles Triggern inkl. dryRun).
- Migration **0005_open_sue_storm** — Tabelle `agentMemoryConsolidations`: eine Zeile je Lauf mit Trigger, Zählern, Retrieval-Metriken und tokenfreier Zusammenfassung.
- `server/development-chat.ts` — Verdrahtung: Injektion je Turn registrieren (`recordLearningInjection`), nächste Nutzer-Nachricht messen (`measureRetrievalOnUserMessage`); sessionId fließt bis in die Learning-Injektion.

### Autonomer Betrieb & Admin-Sicht

- `.github/workflows/memory-consolidation.yml` — täglich 03:30 UTC (05:30 MESZ, vor dem Tech-Scan), `DATABASE_URL` aus den Repo-Secrets, `scripts/memory-consolidation.ts` via tsx — analog dem etablierten seed-admin-Muster. Kein neuer Secret, kein externes Konto.
- Dashboard-Kachel **„Agenten-Gedächtnis (Admin)"** (`app/(tabs)/dashboard.tsx`): Bestandsgröße, letzter Lauf (behalten/zusammengeführt/entfernt/Widersprüche), Retrieval-Trefferquote. Standardnutzer sehen keine Kachel (Admin-Gate).

## Retrieval-Metrik-Definition (für den Sprint-Bericht geforderte Messbarkeit)

- **Stichprobe:** ein Chat-Turn mit ≥ 1 injizierten Learning + die nächste Nutzer-Nachricht derselben Session.
- **Treffer:** mindestens ein Keyword eines injizierten Learnings (≥ 3 Zeichen) erscheint in der Folgenachricht — wiederverwendetes Wissen.
- **Trefferquote:** Anteil der Stichproben mit ≥ 1 Treffer (Rolling, prozess-lokal). Startwert 0 % bis Chat-Betrieb Stichproben liefert — die Kachel zeigt das ehrlich an.
- **Ø Injektionen:** durchschnittlich injizierte Learnings je Turn (Soll: nahe der Obergrenze 3 ohne Rauschen darunter).

## Tests (22 neu, deterministisch, ohne Datenbank)

- Aehnlichkeit: Jaccard-Spektrum, Teilmenge, Titel-Route (inhaltsvoll vs. generisch), Schwellwert-Kante 0.6.
- Merge-Gruppen: transitive Union-Find-Kette (1–2 ähnlich, 2–3 ähnlich, 1–3 nicht), Einzelnlearnings, Schwellwert-Trennung.
- Veraltung: Rauschen fällt weg, substanzielle und wertvolle Learnings bleiben, junge bleiben.
- Widersprüche: gegenläufige Polarität markiert (neu/altten korrekt zugeordnet), gleiche Polarität und verschiedene Themen nicht.
- Gesamtplan: leerer Bestand, Duplikate+Rauschen+Rest, keine Doppel-Invalidierung von Merge-Opfern/-Trägern, dedupRate, tokenfreie Zusammenfassung.
- Metriken: Trefferzählung, Kurz-Keyword-Ausschluss, Aggregation (Trefferquote, Durchschnitt), leere Stichprobe.

## Konventionen

- Keine Secrets im Code; der Workflow nutzt ausschließlich bestehende Repo-Secrets (DATABASE_URL).
- Reine Logik in `lib/`, DB-Zugriffe in `server/db.ts`, Orchestrierung in `server/`, UI ehrlich bei fehlenden Daten.
- Migration als separate Datei (`drizzle/0005_open_sue_storm.sql`), Auto-Migrate über den Render-Deploy-Pfad bleibt unverändert.

## Nächste Schritte (Sprint 114)

Revenue-OS-Integration als read-only Sub-Agenten-Quelle (Umsatz, Content-Status, Affiliate-Klicks aus der Schwestersystem-Datenbank) — analog dem Sub-Agenten-Muster aus Sprint 93; Schreib-Tools bewusst kein Teil dieses Sprints.

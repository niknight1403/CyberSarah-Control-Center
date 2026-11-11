# Sprint 8 — Run-Engine: Step-Loop, Limitdurchsetzung, Abbruchpfad

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 7 (Ausführung)
**Status:** Implementiert, getestet, dokumentiert. Live-Werkzeugaufrufe bleiben bewusst deaktiviert.

## 1. Ausgangslage

Sprint 7 lieferte geprüfte Pläne mit Budgetaufteilung, aber nichts führte sie aus. Die
Gefahr dabei ist nicht der fehlende Loop, sondern ein Loop, der Limits nur protokolliert
und im Zweifel weiterläuft. Sprint 8 baut deshalb zuerst die **Abbruchpfade**, dann den
Loop.

## 2. Reine Logik — `lib/mcp-run-engine-logic.ts`

- **Zustandsmaschine:** `pending → running → paused / completed / aborted / failed`.
  Jeder Zustandsübergang ist eine reine Funktion mit injizierter Zeit.
- **Reihenfolge:** `nextTask` folgt `plan.order`, prüft Abhängigkeiten und liefert
  `runnable`, `needs_approval`, `waiting` oder `done`. Aufgaben ohne Agenten laufen
  nicht, sie werden gemeldet.
- **Jeder Schritt kostet:** `applyStep` verbucht Schritte und Kosten **auch bei
  Fehlschlägen**, damit ein Absturz nicht als günstig gilt.
- **Wiederholung mit Grenze:** Fehlschlag → `pending` bis `maxAttemptsPerTask`, danach
  `failed`. Kein endloses Retry.
- **Harte Limits:** Budget, Schritte und Dauer werden nach **jedem** Schritt geprüft
  (`evaluateRunLimits`). Ein erreichtes Limit setzt `aborted`, schreibt den Grund und
  markiert unbearbeitete Aufgaben als `skipped`.
- **Freigaben halten an:** `approval_required` setzt den Lauf auf `paused`, die Aufgabe
  bleibt `pending`, bis `approveTask` sie freigibt.
- **Ehrlicher Abschluss:** `finalizeRun` setzt `completed` nur, wenn keine Aufgabe mehr
  offen ist. Sind Aufgaben fehlgeschlagen, wird der Lauf `failed` mit Namensliste.
- **Startpflicht:** `canExecute` verweigert Schritte nach Laufende, ohne Freigabe, ohne
  Agenten und bei erschöpftem Budget.

Nebenbefund: `evaluateRunLimits` (Sprint 7) behandelte **exakt aufgebrauchtes Budget**
als „ok". Das war ein echter Fehler und wurde auf `>=` korrigiert; ein Test in Sprint 7
deckte ihn nicht ab, der neue Test in Sprint 8 schon.

## 3. Persistenz und Service

- **Migration `0035_mcp_team_runs.sql`**: `mcp_team_runs` mit `plan_id`, Status,
  vollständigem Zustand (JSON), Kosten, Schritten, Abbruchgrund, Start-/Endzeit.
  Der Zustand ist damit nach einem Neustart nachvollziehbar.
- `server/mcp-run-store.ts`: Liste, Abruf, Anlegen, Speichern (Status/Kosten/Schritte
  werden zusätzlich als Spalten gespiegelt, damit Abfragen ohne JSON-Parsing gehen).
- `server/mcp-run-service.ts`: `start`, `step`, `advance`, `approve`, `abort`, `get`,
  `list`.
- **Bewusste Entscheidung — `refusingExecutor`:** Ohne verdrahteten Werkzeug-Executor
  antwortet jeder Schritt mit `execution_disabled`, der Lauf endet `failed` mit klarem
  Grund. Es wird **kein Erfolg vorgetäuscht**. Live-Aufrufe brauchen den Freigabe- und
  Audit-Pfad aus Sprint 9.
- **Nicht wiederholbare Fehler** beenden den Lauf sofort (`failed`), statt bis zum
  Retry-Limit weiterzulaufen. Ein deaktivierter Executor ist nicht „flaky".

## 4. API (alle `adminProcedure`)

```
mcp.runs.start   { planId, budgetCents?, maxSteps?, maxDurationMs?, maxAttemptsPerTask? }
mcp.runs.step    { runId }                       # genau ein Schritt
mcp.runs.advance { runId, maxIterations? }        # bis Pause/Abbruch/Abschluss
mcp.runs.approve { runId, taskId }
mcp.runs.abort   { runId, reason }
mcp.runs.list    { limit? }
mcp.runs.get     { runId }
```

## 5. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-run-engine-logic.test.ts` | 22 | Initialisierung, Start, Reihenfolge, Warten auf Vorgänger, fehlende Agenten, Freigabebedarf, Abschluss, Kosten/Schritte, negative Kosten, Retry bis Limit, Pause und Freigabe, Budget- und Schrittlimitabbruch, `finalizeRun` (completed/paused/failed), manueller Abbruch, Zusammenfassung, `canExecute`-Verweigerungen, Restbudget |
| `tests/mcp-run-service.test.ts` | 10 | Start (auch unbekannter Plan, Budget 0), Schritt mit Kosten, **kein vorgetäuschter Erfolg ohne Executor**, wiederholbare Fehler, Budgetabbruch, `advance` bis Abschluss, Freigabe-Zyklus, fremde Aufgabe, Abbruch und spätere Schritte |

Gesamtsuite: **488 Dateien / 4.085 Tests grün** (vorher 486 / 4.053).

## 6. Ehrliche Grenzen

1. **Keine echten Werkzeugaufrufe.** Der Standard-Executor verweigert; der Service ist
   fertig, die Anbindung an `mcp.callTool` kommt mit Audit/Freigabe (Sprint 9).
2. **Kein Hintergrundläufer.** Schritte werden über `step`/`advance` angestoßen, es gibt
   noch keinen Cron oder Worker, der einen Lauf selbst weiterzieht.
3. **Kein Parallelismus.** Der Loop arbeitet streng sequenziell in Planreihenfolge.
4. **Neustart-Resistenz nur lesend.** Der Zustand ist persistiert und lesbar; ein Lauf
   wird nach einem Prozessabbruch nicht automatisch fortgesetzt.
5. **`advance` ist begrenzt** (max. 50 Iterationen pro Aufruf), absichtlich, damit ein
   Aufruf nicht unbegrenzt Ressourcen bindet.
6. **Kosten sind gemeldet, nicht gemessen.** Kosten kommen vom Executor; ohne echten
   Executor bleibt die Kostenzahl eine Behauptung des Aufrufers.

## 7. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 488 Dateien / 4.085 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0035` inkl. Journal-Eintrag.

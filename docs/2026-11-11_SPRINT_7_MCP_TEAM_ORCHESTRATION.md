# Sprint 7 — Team-Orchestrierung: Zerlegung, Delegation, Limits

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 6 (Team-Orchestrierung)
**Status:** Implementiert, getestet, dokumentiert. Ausführung folgt in Sprint 8.

## 1. Ausgangslage

Sprint 6 lieferte Agenten als prüfbare Spezifikationen. Was fehlte, war die Frage, wer
welche Teilaufgabe übernimmt und **ob eine Weitergabe überhaupt erlaubt ist**. Genau dort
entstehen die teuren Fehler: Ein Research-Agent, der eine Rechnung ausstellt, weil er
„irgendwie" an ein Zahlungswerkzeug kommt.

Sprint 7 implementiert deshalb keine Ausführungsengine, sondern die
**Berechtigungs- und Limitprüfung vor dem Lauf**.

## 2. Reine Logik — `lib/mcp-team-orchestration-logic.ts`

- **Zerlegung:** Ziel → Phasen (`scope`, `research`, `produce`, `verify`, `publish`,
  `report`) aus Stichwörtern, deterministisch und in fester Reihenfolge. Recherche,
  Prüfung und Bericht sind immer dabei, weil ein Lauf ohne Prüfung kein Ergebnis ist.
- **Zuweisung über Eignung:** Token-Überschneidung zwischen Aufgabe und
  Agentenprofil (Name, Rolle, Werkzeugnamen). **Kein Treffer heißt offen** — die
  Aufgabe bleibt unbesetzt und wird als Warnung ausgewiesen, statt an einen
  ungeeigneten Agenten zu gehen.
- **Delegationsregel (`canDelegate`)** mit vier harten Sperren:
  1. kein Selbstauftrag,
  2. kein Rechtezuwachs (jedes Kind-Werkzeug muss der Eltern-Agent ebenfalls haben),
  3. keine höhere Risikostufe beim Kind oder in der Aufgabe,
  4. Restbudget muss reichen; zusätzlich Schleifenerkennung über `visited`.
- **Kettenprüfung (`validateDelegationChain`):** prüft die Vererbung über beliebig
  viele Stufen, nicht nur über eine.
- **Budget:** proportionale Verteilung nach Schätzung, Rundungsrest dem ersten Task
  zugeschlagen, sodass die Summe **exakt** dem Budget entspricht.
- **Laufzeitlimits (`evaluateRunLimits`):** Budget, Schritte, Dauer. Ein erreichtes
  Limit bedeutet **Abbruch**, nicht „weiter mit Warnung".
- **Graphprüfung:** topologische Ordnung mit Zyklus-, Doppel-ID- und
  Fremdabhängigkeitserkennung.

## 3. Persistenz und Service

- **Migration `0034_mcp_team_plans.sql`**: `mcp_team_plans` speichert Ziel, Plan (JSON),
  Budgetaufteilung, Aufgabenzahl, offene Aufgaben, Status, Ersteller.
- `server/mcp-team-store.ts`: Liste, Einzelabruf, Einfügen, Status; dazu
  `toAgentProfile`, das gespeicherte Agenten tolerant in Profile übersetzt (Altbestand
  ohne Sicherheitsprofil fällt auf sichere Defaults zurück, `critical` bleibt
  freigabepflichtig).
- `server/mcp-team-service.ts`: **nur aktive Agenten** bilden ein Team; `preview`
  plant ohne zu speichern; `plan` speichert ausschließlich validierte Pläne. Scheitert
  die Zerlegung, wird nichts gespeichert.

## 4. API (alle `adminProcedure`)

```
mcp.team.agents  {}                                      # aktive Teammitglieder
mcp.team.preview { objective, budgetCents, maxTasks? }    # planen ohne speichern
mcp.team.plan    { objective, budgetCents, maxTasks? }    # Plan speichern
mcp.team.list    { limit? }                              # letzte Pläne
mcp.team.get     { id }
```

## 5. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-team-orchestration-logic.test.ts` | 36 | Phasenerkennung, Zerlegung, Zuweisung, offene Aufgaben, Budgetwarnung, Aufgabengrenze, Ablehnungsfälle, topologische Ordnung (Zyklus, Doppel-ID, Fremdabhängigkeit), Delegation (Selbstauftrag, Rechtezuwachs, Risiko, Budget, Schleife, Kette), Budgetverteilung exakt, Laufzeitlimits, Planprüfung, Eignungsscore, Zusammenfassung, Risikoklassifizierung |
| `tests/mcp-team-service.test.ts` | 9 | Profil-Defaults, nur aktive Agenten, Preview speichert nicht, exakte Budgetsumme, gespeicherter Plan, Team ohne Agenten, kurzes Ziel, kein Speichern bei Fehler, Abruf |

Gesamtsuite: **486 Dateien / 4.053 Tests grün** (vorher 484 / 4.008).

## 6. Ehrliche Grenzen

1. **Keine Ausführung.** Pläne sind Momentaufnahmen; Aufgaben laufen noch nicht, es gibt
   keinen Step-Loop und keine Zustellung an Agenten.
2. **Zuweisung ist stichwortbasiert.** Sie ist reproduzierbar, aber grob: „Lead" in
   „Lead Developer" kann die Research-Rolle anziehen.
3. **Zerlegung ist ein festes Phasenschema**, keine freie Planung. Für komplexe Ziele
   mit Verzweigungen fehlt ein echter Planner.
4. **Kein Parallelismus.** Der Graph erlaubt parallele Zweige, der Plan nutzt sie noch
   nicht (er ist eine Kette).
5. **Laufzeitlimits sind Logik, nicht erzwungen.** `evaluateRunLimits` ist getestet,
   aber es gibt noch keinen Lauf, der sich daran abbricht.
6. **Gelöschte Agenten:** Pläne referenzieren über `agentKey`. Wird ein Agent gelöscht,
   bleiben alte Pläne lesbar, ihre Zuweisungen zeigen aber ins Leere.

## 7. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 486 Dateien / 4.053 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0034` inkl. Journal-Eintrag.

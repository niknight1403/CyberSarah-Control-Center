# Sprint 10 — Freigabe-Workflow: Queue, Ablauf, Vier-Augen-Prinzip

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 9 (Freigaben)
**Status:** Implementiert, getestet, dokumentiert.

## 1. Ausgangslage

Sprint 9 konnte Aufrufe blocken und Freigabebedarf melden — aber es gab keinen Weg,
diese Freigabe zu erteilen. Der Lauf blieb stehen, und niemand konnte ihn legal
weiterbewegen. Genauso wichtig: eine Freigabe ohne Ablauf und ohne Bindung an den
konkreten Aufruf wäre eine Dauererlaubnis für alles.

## 2. Reine Logik — `lib/mcp-approval-workflow-logic.ts`

Vier Regeln, hart erzwungen:

1. **Vier-Augen-Prinzip:** `castVote` lehnt ab, wenn `approver === requestedBy`. Die
   eigene Anfrage freigeben ist unmöglich, nicht nur unerwünscht.
2. **Zwei Stimmen bei hohem Risiko:** `requiredApprovalsFor` gibt `critical` und `high`
   zwei unabhängige Freigaben, `medium`/`low` eine.
3. **Ein Veto genügt:** Jede `reject`-Stimme setzt die Anfrage sofort auf `rejected`,
   auch wenn schon eine Freigabe vorlag. Kein Überstimmen.
4. **Freigaben laufen ab:** TTL zwischen 5 Minuten und 7 Tagen (Standard 24 h).
   `expireRequest` schließt abgelaufene Anfragen, auch bereits erteilte Freigaben, die
   nie genutzt wurden.

Weitere Details:

- **Doppelstimmen** werden abgelehnt (`duplicate_vote`), leere Prüfer (`empty_approver`)
  ebenfalls — eine Freigabe braucht einen erkennbaren Menschen.
- **Bindung an den Aufruf:** `isUsableForCall` prüft Lauf, Aufgabe, Server, Werkzeug
  **und** Argument-Hash. Ändert sich ein Argument, ist die Freigabe wertlos
  (`args_changed`). Damit ist „Freigabe für Suche X" nicht „Freigabe für Suche Y".
- **Einmalnutzung:** `consumeRequest` entwertet nach dem Aufruf (auch bei Fehlschlag).
- **Queue-Zusammenfassung** zählt offen/freigegeben/abgelehnt/abgelaufen und nennt das
  Alter des ältesten offenen Antrags.

## 3. Persistenz und Service

- **Migration `0037_mcp_approval_requests.sql`**: Anfrage mit Lauf, Aufgabe, Agent,
  Server, Werkzeug, Risiko, Gründen, Argument-Hash, benötigten Stimmen, Status,
  Antragsteller, Ablauf, Entscheidungszeit und Stimmen (JSON).
- `server/mcp-approval-store.ts`: Liste (optional nach Status), Einzelabruf, je Lauf,
  offene Anfragen, Insert, Save.
- `server/mcp-approval-service.ts`: `request` (entdoppelt offene Anfragen für denselben
  Aufruf), `decide`, `list`, `listByRun`, `get`, `sweep` (Ablauf), `findUsable`,
  `consume`, `queue`.

## 4. Anbindung an die Execution Bridge

Die Bridge prüft vor einem freigabepflichtigen Aufruf, ob eine **gültige** Freigabe für
exakt diesen Aufruf existiert:

- ja → Aufruf erfolgt, Audit-Notiz nennt `Freigabe #<id> genutzt`, Freigabe wird
  unmittelbar danach verbraucht (auch bei Fehlschlag);
- nein → wie bisher `approval_required`, der Lauf bleibt pausiert.

Damit sind es zwei getrennte Tore, die beide offen sein müssen: der Lauf muss fortgesetzt
(`mcp.runs.approve`) **und** der Werkzeugaufruf fachlich freigegeben sein
(`mcp.toolApprovals.decide`). Absicht: ein Klick setzt keinen Zahlungsaufruf frei.

## 5. API (alle `adminProcedure`)

```
mcp.toolApprovals.request  { runId, taskId, agentKey, serverKey, toolName, riskLevel, argsHash, requestedBy, reasons?, ttlMs? }
mcp.toolApprovals.decide   { id, approver, decision: approve|reject, note? }
mcp.toolApprovals.list     { limit?, status? }
mcp.toolApprovals.get      { id }
mcp.toolApprovals.byRun    { runId }
mcp.toolApprovals.queue    { limit? }
mcp.toolApprovals.sweep    {}
```

## 6. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-approval-workflow-logic.test.ts` | 19 | Stimmenbedarf je Risiko, TTL-Grenzen, Selbstfreigabe, Doppelstimme, Freigabe mit einer/zwei Stimmen, Veto, Stimmen nach Entscheidung/Ablauf, Ablauf, Einmalnutzung, Deckung nur für exakten Aufruf (Argumente, Werkzeug, Aufgabe, Lauf, Server), Queue-Zählung |
| `tests/mcp-approval-service.test.ts` | 13 | Anlegen mit zwei Stimmen, Entdopplung, neue Anfrage bei anderen Argumenten, Selbstfreigabe, Freigabe nach zwei Stimmen, unbekannte Anfrage, `findUsable` (positiv/abweichende Argumente), Verbrauch, Sweep, Queue, Liste je Lauf |
| `tests/mcp-execution-bridge-service.test.ts` | +3 | Aufruf mit gültiger Freigabe, Verbrauch auch bei Fehlschlag, weiterhin verweigert ohne Freigabe |

Gesamtsuite: **492 Dateien / 4.156 Tests grün** (vorher 490 / 4.121).

## 7. Ehrliche Grenzen

1. **Prüfer sind Namen, keine Identitäten.** `approver` ist ein String; die API prüft
   nicht, ob die Person wirklich existiert. Ohne Auth-Bindung bleibt Vier-Augen eine
   Regel, keine Garantie.
2. **Kein Benachrichtigungspfad.** Es gibt keine Mail, keinen Push, keinen Reminder für
   offene Freigaben; der `sweep` muss aufgerufen werden, damit Ablauf wirkt (kein Cron).
3. **Ein `approve` je Lauf und Aufgabe.** Die Lauf-Fortsetzung aus Sprint 8 ist nicht an
   die Freigabe gekoppelt; beide Tore müssen manuell geöffnet werden.
4. **Argument-Hash statt Inhalt.** Das Audit kann nicht zeigen, *was* freigegeben wurde,
   nur dass es identisch war. Das ist Absicht (keine Secrets), kostet aber Nachvollziehbarkeit.
5. **Keine Teilmenge, kein „approve all".** Jede Freigabe gilt für genau einen Aufruf;
   bei vielen Aufrufen entsteht viel Klickarbeit.
6. **Kein Vier-Augen für die Ablehnung.** Ein Veto allein beendet die Anfrage, was
   beabsichtigt ist, aber auch missbräuchlich blockieren kann.

## 8. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 492 Dateien / 4.156 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0037` inkl. Journal-Eintrag.

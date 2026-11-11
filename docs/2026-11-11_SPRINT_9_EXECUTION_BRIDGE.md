# Sprint 9 — Execution Bridge: echte Werkzeugaufrufe mit Freigabe- und Audit-Pfad

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 8 (Ausführungsbrücke)
**Status:** Implementiert, getestet, dokumentiert. Live-Aufrufe sind per Umgebungsvariable abgeschaltet.

## 1. Ausgangslage

Sprint 8 hatte einen Loop, aber keinen Executor: jeder Lauf endete ehrlich mit
`execution_disabled`. Sprint 9 schließt die Lücke — ohne selbst Rechte, Credentials oder
Transport zu duplizieren, denn das leistet der Server-Service aus Sprint 2/3/5 bereits.

## 2. Reine Logik — `lib/mcp-execution-bridge-logic.ts`

- **Werkzeugwahl nur aus Grants:** Der Katalog wird **vor** der Suche auf die Werkzeuge
  des Agenten gefiltert. Ein besser passendes, aber nicht vergebenes Werkzeug kann nicht
  gewinnen. Kein Katalogtreffer → `no_granted_tools`, kein Treffer → `no_match`.
- **Keine erfundenen Argumente:** `requiredArguments` liest `inputSchema.required`
  fehlertolerant; `checkArguments` blockt fehlende Pflichtfelder. `0` und `false` gelten
  als gültig, leere Strings nicht — sonst würde ein leerer Suchbegriff als „gesetzt"
  durchgehen.
- **Policy-Gate:** `gateCall` nutzt `evaluateToolPolicy` aus Sprint 3 mit dem Modus des
  Agenten. Kritische Werkzeuge bleiben immer freigabepflichtig.
- **Konservative Fehlerklassifikation:** Nur echte Netz-/Rate-Limit-Muster
  (`timeout`, `econn`, `429`, `502..504`) gelten als wiederholbar. Freigabebedarf und
  Governance-Blockaden sind **nicht** wiederholbar, sonst würde ein blockierter Aufruf
  stillschweigend wiederholt.
- **Audit ohne Werte:** `hashArguments` (SHA-256 über kanonisch sortierte Argumente) und
  `summarizeArguments` (nur Schlüssel und Typen). Ein Test prüft, dass ein
  `apiKey`-Wert nicht im Audit landet.

## 3. Service — `server/mcp-execution-bridge-service.ts`

Reihenfolge vor jedem Netzwerkaufruf: **Agent → Werkzeug aus Grants → Argumente → Policy
→ Aufruf → Audit.** Jeder Ausgang wird auditiert, auch Blockaden und Timeouts.

- Agent unbekannt oder nicht `active` → `unknown_agent` / `agent_inactive`, kein Aufruf.
- Policy `block` → `policy_blocked`; Policy `approval_required` → `approval_required`
  (der Run-Service pausiert daraufhin, statt zu scheitern).
- Timeout: `Promise.race` mit konfigurierbarem Limit (Standard 30 s).
- Kosten: nur bei Erfolg `DEFAULT_CALL_COST_CENTS` (5 Cent), bewusst konservativ und
  **als Schätzung dokumentiert**, keine Messung.
- Audit-Ausfall verfälscht das Aufrufergebnis nicht, wird aber auch nicht als Erfolg
  verbucht.

Zusätzlich `resolve`: Vorschau auf Werkzeug, Risiko, Policy-Entscheidung und fehlende
Pflichtfelder **ohne** Aufruf.

## 4. Run-Service-Anpassung

Der Executor liefert jetzt `runId` mit (Audit-Zuordnung), und `approval_required` wird
als **Pause** verbucht, nicht als Fehlschlag. Live-Aufrufe sind doppelt geschützt:
`MCP_LIVE_EXECUTION=1` aktiviert die Bridge, sonst bleibt `refusingExecutor` aktiv.

## 5. Persistenz

- **Migration `0036_mcp_execution_audit.sql`**: `mcp_execution_audit` mit Lauf, Aufgabe,
  Agent, Server, Werkzeug, Entscheidung, Risikostufe, Argument-Schlüsseln, Hash, Kosten,
  Dauer, Notiz, Versuch, Zeitstempel. Kein Update, kein Delete.
- `server/mcp-execution-audit-store.ts`: Liste (optional je Lauf) und Insert.

## 6. API (alle `adminProcedure`)

```
mcp.execution.resolve { agentKey, goal, taskId?, args? }   # Vorschau, kein Aufruf
mcp.execution.enabled {}                                   # ist Live-Ausführung an?
mcp.execution.audit   { limit?, runId? }                   # Protokoll
```

## 7. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-execution-bridge-logic.test.ts` | 23 | Werkzeugwahl nur aus Grants, kein Treffer, kritische Erkennung, Pflichtfelder (inkl. `0`/`false`, leere Strings), Policy-Entscheidungen, Ergebnisklassifikation (Erfolg/Freigabe/Blockade/Retry/unklar), Hash-Stabilität, Audit ohne Werte, Standardkosten |
| `tests/mcp-execution-bridge-service.test.ts` | 13 | unbekannter/inaktiver Agent, fehlender Grant, fehlende Argumente ohne Aufruf, Policy-Blockade, Freigabe vor Aufruf, erfolgreicher Aufruf mit Argumenten, kein Geheimnis im Audit, Timeout wiederholbar ohne Kosten, Exception, Audit-Ausfall, Vorschau |

Gesamtsuite: **490 Dateien / 4.121 Tests grün** (vorher 488 / 4.085).

## 8. Ehrliche Grenzen

1. **Live-Aufrufe sind standardmäßig aus.** `MCP_LIVE_EXECUTION=1` ist nötig; ohne sie
   bleibt der Lauf bei `execution_disabled`. Es gibt noch keinen Test gegen einen echten
   MCP-Server.
2. **Argumente kommen aus der Aufgabe.** Es gibt keinen Generator, der Argumente aus
   einem Ziel ableitet; fehlt `task.args`, blockt der Aufruf bei Pflichtfeldern.
3. **Kosten sind geschätzt, nicht gemessen.** 5 Cent je Aufruf ist eine Konstante.
4. **Kein Freigabe-Workflow für Tool-Aufrufe.** Der Lauf pausiert, aber es gibt noch
   keine Approval-Queue mit Ablauf, Vier-Augen-Prinzip oder Benachrichtigung.
5. **Audit ist nicht manipulationssicher.** Es ist unveränderlich per API, aber
   Schreibzugriff auf die Tabelle bliebe möglich.
6. **Ein Werkzeug pro Aufgabe.** Kein Multi-Tool-Schritt, keine Verkettung im selben Step.

## 9. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 490 Dateien / 4.121 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0036` inkl. Journal-Eintrag.

# Sprint 6 — Agent Factory

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 5 (Agent Factory)
**Status:** Implementiert, getestet, dokumentiert.

## 1. Ausgangslage

Bis Sprint 5 gab es alles, was ein Agent zum Arbeiten braucht — Registry, Governance-Gate,
Vault, Supervisor — aber keinen Weg, aus einer Aufgabe einen **prüfbaren Agenten** zu
machen. `superAgents` (Chat-Personas) sind dafür ungeeignet: sie haben keine
Werkzeugvergabe, kein Budget, keine Freigaberegeln und keine Abnahmetests.

Sprint 6 baut deshalb **keine** zweite Agentenplattform, sondern eine
Spezifikationsschicht über den bestehenden Komponenten.

## 2. Was ein Agent hier ist

Eine gespeicherte Spezifikation, keine laufende Instanz:

- **Identität:** Schlüssel (`web-scout`), Name, Rolle.
- **Systemprompt:** Rolle, Werkzeugliste, Budget, Regel „nichts erfinden".
- **Werkzeugvergabe:** je Server/Werkzeug mit Risikostufe und Begründung, getrennt
  speicherbar und entziehbar.
- **Sicherheitsprofil:** Modus, maximal erlaubte Risikostufe, Budget pro Lauf,
  Schrittlimit, freigabepflichtige Stufen, erlaubte Server.
- **Abnahme:** Testfälle und Qualitätskriterien aus der Aufgabe abgeleitet.
- **Monitoring:** Fehlerquote, Kosten, offene Freigaben.
- **Version** und Status (`draft` → `active` / `paused`).

## 3. Reine Logik — `lib/mcp-agent-factory-logic.ts`

- **Rollenerkennung** über deutsche und englische Stichwörter (Forschung, Vertrieb,
  Marketing, Content, Engineering, Support, Finanzen, Security, Operations).
- **Werkzeugauswahl** über die bestehende IDF-Suche (`searchTools`) und
  Risikoklassifizierung (`classifyRisk`) aus Sprint 3 — kein neuer Scoring-Pfad.
- **Harte Regel:** kritische Werkzeuge (Zahlungen, Löschungen) werden **ohne
  ausdrückliche Erlaubnis nicht vergeben**, sondern als Warnung ausgewiesen.
- **Sicherheitsprofil folgt dem Risiko:** Sobald ein High- oder Critical-Werkzeug
  vergeben ist, sind High und Critical freigabepflichtig; der Modus bleibt `assisted`.
- **Ehrliche Warnungen** statt stiller Leere: leerer Katalog, keine Treffer, keine
  Werkzeuge, ausgeschlossene kritische Werkzeuge.

## 4. Validierung — der eigentliche Wert

`validateAgentSpec` prüft gegen den **echten Katalog** und gegen die Sicherheitsregeln:

| Prüfung | Ergebnis |
|---|---|
| Werkzeug nicht im Katalog | Fehler |
| Doppelte Vergabe | Fehler |
| Mehr als 12 Werkzeuge | Fehler |
| Sicherheitsprofil deckt Risikostufe nicht ab | Fehler |
| Autonomer Modus mit High/Critical | Fehler |
| `critical` nicht freigabepflichtig | Fehler |
| Freigabepflicht für `low`/`medium` | Fehler (verschleiert echte Risiken) |
| Budget ≤ 0, Schritte außerhalb 1..60 | Fehler |
| Server erlaubt, aber ohne Werkzeug | Warnung |
| Agent ohne Werkzeuge | Warnung, aber freigabefähig |

## 5. Persistenz und Service

- **Migration `0033_mcp_agents.sql`**: `mcp_agent_specs` (mit `security` als JSON,
  Abnahmetests, Kriterien, Monitoring, Warnungen, Version, Status) und
  `mcp_agent_grants` (eine Zeile je Werkzeug, `unique(agent_id, server_key, tool_name)`).
- `server/mcp-agent-store.ts`: Liste mit Grants, Suche, Einfügen, Status, Löschen.
- `server/mcp-agent-service.ts`: Katalog **nur aus aktiven Servern mit entdeckten
  Werkzeugen**, `dryRun` (planen ohne speichern), `create` (nur gültige Entwürfe, immer
  `draft`), Statuswechsel mit Schutz: **ein Agent ohne Werkzeuge lässt sich nicht
  aktivieren**, weil er keinen Ausführungspfad hätte.

## 6. API (alle `adminProcedure`)

```
mcp.agents.catalog   {}                       # verfügbare Werkzeuge
mcp.agents.dryRun    { name, brief, allowCritical?, maxGrants? }
mcp.agents.create    { name, brief, allowCritical?, maxGrants? }
mcp.agents.list      {}
mcp.agents.get       { agentKey }
mcp.agents.setStatus { agentKey, status: draft|active|paused }
mcp.agents.remove    { agentKey }
```

## 7. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-agent-factory-logic.test.ts` | 24 | Rollenerkennung, Schlüsselbildung mit Umlauten, Werkzeuge nur aus dem Katalog, kritische Werkzeuge ohne Erlaubnis ausgeschlossen, Vergabelimit, keine Doppelvergabe, Prompt/Tests/Monitoring, leerer Katalog, Validierung (Katalog, autonomer Modus, Freigaben, Risikoprofil, Budget, Schritte, allowedServers), Zusammenfassung ohne Prompt-Inhalt, Versionierung |
| `tests/mcp-agent-service.test.ts` | 9 | Katalog nur aus aktiven Servern mit Werkzeugen, `dryRun` speichert nicht, Ablehnung kurzer Aufgaben, Speichern als `draft`, doppelte Schlüssel, Aktivierung, Verweigerung ohne Werkzeuge, unbekannte Agenten, ehrliches Löschen |

Gesamtsuite: **484 Dateien / 4.008 Tests grün** (vorher 482 / 3.975).

## 8. Ehrliche Grenzen

1. **Keine Ausführung.** Der Agent ist eine Spezifikation; Läufe, Step-Loop und
   Werkzeugaufrufe kommen erst mit der Team-Orchestrierung (Sprint 7).
2. **Kein LLM im Planungsschritt.** Die Planung ist deterministisch (Suche + Regeln).
   Das ist reproduzierbar und testbar, ersetzt aber kein Sprachmodell für feine
   Aufgabenformulierungen.
3. **Werkzeugkatalog hängt an Discovery.** Ohne `tools`-Eintrag eines Servers bleibt er
   unsichtbar; ein Live-`tools/list` beim Planen gibt es noch nicht.
4. **Kein Rechte-Entzug im UI.** Grants sind entziehbar, aber es gibt noch keinen
   Endpunkt, der einzelne Grants nachträglich ändert.
5. **Rollen sind Stichwortbasiert.** „Lead" in „Lead Developer" führt zur
   Research-Rolle; Rollen können überschrieben werden, aber die Heuristik bleibt grob.

## 9. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 484 Dateien / 4.008 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0033` inkl. Journal-Eintrag.

# Sprint 3 — Capability-Mapper, Policy-Gate und Freigaben

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Module 3 (Capability-Based Tool Mapper) und 5 (Governance Gateway)
**Status:** Implementiert, getestet, dokumentiert. Credential Vault/OAuth2 (Modul 2) und Connection Supervisor (Modul 4) folgen in Sprint 4/5.

## 1. Ausgangslage

Nach Sprint 2 existierte eine Registry, die Server kennt, prüft und aufruft. Was fehlte,
war die Antwort auf zwei Fragen:

1. **Welches Werkzeug passt zu einer Aufgabe?** Agenten mussten Tool-IDs kennen; die
   Deskriptoren aus `tools/list` wurden nur gecacht, nicht verstanden.
2. **Darf dieses Werkzeug jetzt laufen?** Der Aufruf prüfte nur grobe
   Server-Berechtigungen. Risiko, Freigabepflicht und Argument-Sanitizing gab es nicht.

Sprint 3 schließt beide Lücken, ohne eine zweite Registry zu bauen: Governance hängt an
`mcp_servers` und nutzt den bestehenden Tool-Cache als einzige Quelle.

## 2. Was gebaut wurde

### 2.1 Datenmodell (Migration `0030_mcp_governance.sql`)

| Objekt | Zweck |
|---|---|
| `mcp_servers.governance_mode` | `manual` / `assisted` / `autonomous` je Server |
| `mcp_tool_governance` | je Werkzeug: Fähigkeiten, Primärfähigkeit, Risikostufe, Entscheidung, Gründe, **Schema-Signatur**, Prüfer |
| `mcp_approvals` | Freigabeanfragen mit Risiko, Status, Argument-Vorschau, Antragsteller, Entscheider, Ablaufzeit |

Die Signatur bindet eine Freigabe an das geprüfte Schema. Ändert der Server ein Tool
(andere Parameter, andere Beschreibung), weicht die Signatur ab und die Entscheidung
muss neu getroffen werden — eine alte Freigabe gilt nicht stillschweigend weiter.

### 2.2 Reine Logik — `lib/mcp-governance-logic.ts`

- **Fähigkeitsableitung**: 12 Kategorien (filesystem, database, web, search,
  code-execution, communication, payments, crm, media, devops, calendar, analytics,
  other) aus Name (doppelt gewichtet), Beschreibung und Schema. Unklare Tools bleiben
  ehrlich `other` mit Konfidenz 0.
- **Semantische Suche**: IDF-gewichtete Token-Suche über die Deskriptoren, Wortstamm-
  Treffer (`pdfs` → `pdf`), Bonus für Namens- und Fähigkeitstreffer, Filter nach
  Fähigkeit und Server. Beantwortet „Tool zum Lesen von PDFs".
- **Risikoklassen**: `low` / `medium` / `high` / `critical` über Wortmengen statt
  brüchiger Wortgrenzen-Regexe (`drop_table` wird erkannt). Zahlungen, Shell-Ausführung
  und schreibende Datenbankzugriffe sind `critical`; destruktive und schreibende
  Aktionen `high`; Dateisystem und externes Netz `medium`.
- **Policy-Entscheidung** in fester Reihenfolge: Deny-Liste → Least Privilege →
  Allow-Liste → Risiko/Freigabemodus. Fehlende Berechtigung blockiert **immer**,
  auch bei Allow-Eintrag. Kritisch verlangt **immer** eine menschliche Freigabe, auch
  im Modus `autonomous`.
- **Argument-Sanitizing**: maximale Tiefe 6, maximal 32 KB, Array-Grenze, verbotene
  Schlüssel (`__proto__`, `constructor`, `prototype`), Steuerzeichen, Shell-Metazeichen
  bei Ausführungsfähigkeit, Pfad-Traversal bei Dateisystemfähigkeit. Nichts wird
  umgeschrieben: entweder sauber oder abgelehnt.
- **Freigabe-Lebenszyklus**: TTL zwischen 5 Minuten und 7 Tagen, Gültigkeit nur für
  dasselbe `server::tool`.

### 2.3 Service — `server/mcp-governance-service.ts`

| Methode | Verhalten |
|---|---|
| `indexServerTools()` | Profile ableiten, Entscheidung je Werkzeug persistieren, verschwundene Tools entfernen |
| `search()` | semantische Suche über aktive Server (deaktivierte werden ausgeblendet) |
| `evaluateCall()` | Argumente prüfen → Policy → existierende Freigabe → sonst **eine** offene Anfrage anlegen (Duplikate werden wiederverwendet) |
| `decideApproval()` | nur `pending` entscheidbar; Genehmigung markiert das Werkzeug als geprüft |
| `listApprovals()` / `expireStaleApprovals()` | Freigaben lesen, abgelaufene auf `expired` setzen |

### 2.4 Integration in den Aufrufpfad

`mcp.servers.callTool` prüft das Governance-Gate **vor** dem Netzwerkaufruf:

- `block` → Aufruf findet nicht statt, Gründe im Klartext.
- `approval_required` → Antwort enthält `approvalRequired { approvalId, riskLevel, reasons }`;
  der Aufruf wird nicht ausgeführt.
- `allow` → die **geprüften** Argumente werden verwendet.

Nach jedem erfolgreichen Healthcheck wird der Governance-Index erneuert; ein
Index-Fehler macht den Healthcheck nicht rot, sondern wird beim nächsten Lauf nachgeholt.

### 2.5 API (alle `adminProcedure`)

```
mcp.servers.setGovernanceMode  { serverKey, mode }
mcp.governance.list            { serverKey? }
mcp.governance.index           { serverKey }
mcp.governance.search          { query, limit?, capability?, serverKey? }
mcp.governance.evaluate        { serverKey, toolName, args }   # Trockenlauf, legt ggf. Anfrage an
mcp.approvals.list             { status? }
mcp.approvals.decide           { id, decision: approved|rejected }
mcp.approvals.expire           {}
```

## 3. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-governance-logic.test.ts` | 35 | Fähigkeitsableitung, Tokenizer, semantische Suche (Ranking, Filter, Grenzen), Risikoklassen inkl. `drop_table`, Policy in allen drei Modi, Deny/Allow, Sanitizing (Proto, Shell, Traversal, Tiefe, Größe, Steuerzeichen), Signatur, Ablauf/Gültigkeit |
| `tests/mcp-governance-service.test.ts` | 15 | Indexierung inkl. Entfernen veralteter Tools, DB-Fehler, Suche ohne deaktivierte Server, Gate (allow/block/approval), genau eine offene Anfrage, Genehmigung → Aufruf erlaubt, Entscheidungsfehler, Ablauf |

Gesamtsuite nach dem Sprint: **478 Dateien / 3.913 Tests grün** (vorher 476 / 3.863).

## 4. Ehrliche Grenzen

1. **Kein UI.** Governance ist über `mcp.governance.*` und `mcp.approvals.*` bedienbar;
   das Control-Center-Panel folgt in Sprint 9 des Master-Plans.
2. **Keine automatische Freigabe durch Zeitablauf.** Abgelaufene Anfragen werden
   `expired`, nicht stillschweigend genehmigt.
3. **Risiko ist Heuristik.** Sie basiert auf Deskriptoren, nicht auf Sandbox-Beobachtung.
   Falsch-negative Fälle sind möglich; deshalb bleibt `critical` immer freigabepflichtig.
4. **Vorschau der Argumente ist gespeichert** (für die Entscheidung nötig). Sie ist
   nicht verschlüsselt; Secrets gehören nicht in Tool-Argumente, der Vault folgt in
   Sprint 4.
5. **Kein Live-Server getestet** — wie in Sprint 2 fehlen Endpunkt und Zugangsdaten.

## 5. Abnahme

- `npm run check`: sauber.
- `npx vitest run`: 478 Dateien / 3.913 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler, 0 Warnungen.
- Migration `0030` inkl. Journal-Eintrag; Ausführung beim Deploy über den bestehenden
  Auto-Migrate-Pfad.

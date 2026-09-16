# Sprint 134 — MCP-Netzwerk-Client (JSON-RPC über Streamable HTTP)

**Datum:** 16.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 929/929 Tests grün, Server-Build erfolgreich

## Ziel

Sprint 122 hat die Transportschicht modelliert, aber bewusst ohne echte Netzwerkverbindung („ein realer Client dockt an `buildTransportEndpoints` + `negotiateTransport` an, sobald ein MCP-Server betrieben wird"). Dieser Sprint schließt genau diese Lücke: ein echter JSON-RPC-Client spricht mit MCP-Servern — Discovery (`tools/list`) und Werkzeugaufruf (`tools/call`) — und integriert die Ergebnisse in die bestehende Registry-Typwelt.

## Umsetzung

### Reine Logik — `lib/mcp-client-logic.ts`

- **JSON-RPC-2.0-Nachrichtenbau:** `initialize` (Protokoll `2025-03-26`, Client-Info CyberSarah-Control-Center), `notifications/initialized` (ohne Id), `tools/list`, `tools/call`; deterministische Id-Vergabe über `nextJsonRpcId`.
- **Antwort-Parsing** (`parseJsonRpcResponse`): Form-Validierung, Id-Matching, Server-Fehler mit Code und Meldung; Antworten ohne `result`/`error` werden ehrlich abgewiesen.
- **Schema-Mapping** (`parseToolInputSchema`): JSON-Schema → typisiertes Registry-Schema; unbekannte oder Union-Typen fallen ehrlich auf `string` zurück statt zu raten.
- **Discovery-Mapping** (`mapDiscoveredTools`): `tools/list`-Ergebnis → Registry-Deskriptoren (`<server>::<name>`, sortiert). **Berechtigungen bleiben konservativ:** Remote-Tools erhalten nur `read` + `network` — Shell- oder Dateisystemzugriff wird nie automatisch verliehen.
- **Ergebnis-Extraktion** (`extractToolCallResult`): Content-Blöcke → Text; `isError` → Fehlschlag; Fallback auf `structuredContent` bzw. JSON.
- **Orchestrierung** (`runMcpDiscovery`): initialize → initialized-Notification → tools/list über eine **injizierte send-Funktion** — Netzwerk bleibt draußen, Tests stecken Fakes rein; abgewiesene Notifications (HTTP 202) werden toleriert.

### Server — `server/mcp-router.ts`

- `mcp.connect` (Admin-Mutation): echter Discovery-Lauf gegen `MCP_SERVER_URL` über Streamable HTTP — Session-Header (`mcp-session-id`) wird übernommen, 10-s-Timeout, SSE-Antworten werden auf `data:`-Zeilen reduziert. Ohne `MCP_SERVER_URL` ehrlich „nicht angeschlossen"; Netzwerk-/Protokollfehler kommen als Grund statt Stacktrace.
- `mcp.callTool` (Admin-Mutation, zod-validiert): Berechtigungs-Gate via `assertToolAllowed` **vor** dem Netzwerkaufruf — Grants kommen aus `MCP_TOOL_PERMISSIONS` (Default `read,network`); Remote-Tools brauchen immer `read`+`network`, mehr wird nie verliehen.
- `mcp.transports` / `mcp.negotiate` aus Sprint 122 unverändert.

## Tests (25 neu, `tests/mcp-client-logic.test.ts`)

- Nachrichtenbau (Protokoll-Version, Client-Info, Notification ohne Id, Id-Zählung).
- Antwort-Parsing (result, Id-Mismatch, fehlende Version, Fehlercode, ohne result/error, Nicht-Objekte).
- Schema-Mapping (alle Typen, required, unbekannte/Array-Typen → string, leeres Schema).
- Discovery-Mapping (Ids, Sortierung, Filterung, konservative Berechtigungen, kaputte payloads).
- Ergebnis-Extraktion (Text-Join, isError, structuredContent/JSON-Fallback, Nicht-Objekte).
- Orchestrierung mit Fake-Transport (korrekte Reihenfolge, Abbruch bei initialize/tools/list-Fehlern, tolerierte Notification, Standard-Client-Name).

## Ehrliche Grenzen (dokumentiert)

- Ohne `MCP_SERVER_URL` meldet `mcp.connect` ehrlich „nicht angeschlossen" — es wird kein Endpunkt geraten.
- `mcp.callTool` baut pro Aufruf ein frisches JSON-RPC-Gespräch auf (kein persistenter Verbindungspool) — bewusst einfach; ein Sitzungs-Cache folgt, sobald ein echter Server im Betrieb LAST zeigt.
- Die MCP-Kachel im Dashboard zeigt weiterhin Transportzustand (Sprint 122); die Anbindung der Kachel an echte Discovery-Ergebnisse ist ein eigener Folgeschritt.
- Server-seitige Integrationstests gegen einen echten MCP-Server bleiben aus, solange kein Server betrieben wird — die Transportschicht ist über injizierte Fakes vollständig getestet.

## Abnahme

- `npm run check` (tsc): sauber.
- `npm test`: 122 Dateien, **929/929 grün** (inkl. Sandbox-Smoke-Tests nach einmaliger `workspace-service`-Installation).
- `npm run build` (Server-Bundle): erfolgreich.
- Keine Secrets im Code; nur ENV-Leses (`MCP_SERVER_URL`, `MCP_TOOL_PERMISSIONS`, `APP_VERSION`).

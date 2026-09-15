# Sprint 122 — MCP-Transport (Streamable HTTP + SSE-Fallback)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 815/815 Tests grün, Server-Build erfolgreich

## Ziel

Transportschicht für das Model Context Protocol an die bestehende Connector-Registry (Sprint-MCP-Registry, `lib/mcp-registry-logic.ts`) andocken: zwei Transporte (modernes Streamable HTTP, älterer HTTP+SSE als Fallback) mit Verhandlung, Endpunkt-Bau, Sicherheits-Validierung und Reconnect-Plan.

## Umsetzung

### Reine Logik — `lib/mcp-transport-logic.ts`

- **Transport-Katalog:** `MCP_TRANSPORTS` mit Streamable HTTP (bevorzugter Standard, Protokoll 2025-03-26, ein `/mcp`-Endpunkt für JSON-RPC über POST + optionalen GET-Stream) und HTTP+SSE (Fallback: `GET /sse` Ereignisstrom, `POST /messages`).
- **Endpunkt-Bau** (`buildTransportEndpoints`): Basis-URL je Transport; Validierung wiederverwendet die Registry-Prüfung (HTTPS-Pflicht, keine privaten/lokalen Adressen) mit logischem Namen „remote" — der Hostname selbst wäre als Registry-Slug unzulässig.
- **Verhandlung** (`negotiateTransport`): Client-Wunsch gewinnt nur bei Server-Unterstützung (fehlende Flags gelten als vorhanden); ohne Wunsch Standard streamable-http; nur-SSE-Server fällt ehrlich auf SSE zurück; ein Server ohne jeden Transport wird abgewiesen statt erraten.
- **Reconnect-Plan** (`reconnectDelaySeconds`): exponentiell 1/2/4/8 s mit Deckel 16 s für unterbrochene SSE-Ströme, deterministisch.
- **Verbindungs-Zustandsmaschine** (`applyTransportEvent`): getrennt → verbindet → verbunden → getrennt/reconnect, unveränderlich (Kopien), Verlauf (`lastConnectedAt`) bleibt erhalten, Transport-Wechsel im Reconnect möglich; `formatConnectedSince` für die Anzeige.

### Server — `server/mcp-router.ts`

- `mcp.transports` (Admin-Query): Katalog plus ehrlich konfigurierte Endpunkte aus `MCP_SERVER_URL` — ohne Env bleibt „nicht angeschlossen" statt geratener URLs; Validierungsfehler werden als Grund gemeldet.
- `mcp.negotiate` (Admin-Mutation, zod-validiert): deterministische Transport-Verhandlung für Tests und Client-Integration.
- Registrierung als `mcp` im App-Router.

### UI — `app/(tabs)/dashboard.tsx`

MCP-Kachel im Admin-Bereich: Anzahl verfügbarer Transporte bzw. „Kein MCP-Server konfiguriert", je Transport Label, Anschlusszustand (angeschlossen / nicht angeschlossen / Validierungsgrund) und Standard-Markierung.

## Tests (14 neu)

- Katalog (bevorzugt/Fallback, Beschreibungen).
- Endpunkt-Bau (gemeinsamer `/mcp`, `/sse`+`/messages`), Sicherheits-Ablehnung (HTTP, localhost, private Netze).
- Verhandlung: Standard, Wunsch-gewinnt, Wunsch-überstimmt, nur-SSE-Fallback, kein-Transport-Ablehnung.
- Reconnect-Plan inkl. Deckel und negativer Eingaben.
- Zustandsmaschine (Ereignisfolge, Kopie-Semantik, Verlauf, Transport-Wechsel).
- Anzeige-Formatierung inkl. Uhrdrift.

## Ehrliche Grenzen (dokumentiert)

- Keine echte Netzwerkverbindung: die Logik ist die verifizierbare Schicht; ein realer Client (SSE-Subscribe, JSON-RPC-POST) dockt an `buildTransportEndpoints` + `negotiateTransport` an, sobald ein MCP-Server betrieben wird.
- Ohne `MCP_SERVER_URL` zeigt der Router ehrlich „nicht angeschlossen" — es werden keine Standard-Endpunkte geraten.

## Sprints 113–122 — Abschluss

Alle zehn Sprints der Roadmap sind abgeschlossen und auf `main` gepusht (jeweils tsc sauber, Suite grün, Server-Build ok): 113 Memory-Konsolidierung, 114 Revenue-OS read-only, 115 Metering-Dashboard, 116 Tech-Scanner-Issues, 117 Onboarding, 118 Agent-Avatar, 119 Offline-Puffer, 120 Backup-Selbstbedienung, 121 Backup-Wächter, 122 MCP-Transport.

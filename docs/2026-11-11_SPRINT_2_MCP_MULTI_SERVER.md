# Sprint 2 — Universal MCP Ecosystem: Multi-Server-Registry

**Datum:** 11.11.2026
**Master-Prompt:** Phase 2 (MCP Server Manager) — Multi-MCP-Verwaltung, Discovery, Health, Berechtigungen
**Status:** Implementiert, getestet, dokumentiert. Live-Verbindung zu einem echten Fremd-MCP-Server in diesem Lauf **nicht** nachgewiesen (kein Server-Endpunkt/Zugangsdaten vorhanden).

## 1. Ausgangslage

Bis Sprint 193 gab es genau einen MCP-Server: `MCP_SERVER_URL` als ENV-Variable,
adressiert über `mcp.connect` / `mcp.callTool`. Alles, was der Master-Prompt für
Phase 2 verlangt (mehrere Server, je eigenes Berechtigungsprofil, Healthchecks,
Kostenprofil, Discovery-Cache, Tool-Routing), war damit strukturell unmöglich.

## 2. Was gebaut wurde

### 2.1 Persistenz — `mcp_servers` (Migration `0029`)

| Spalte | Zweck |
|---|---|
| `server_key` (unique) | stabiler Slug, gleichzeitig Routing-Präfix `server::tool` |
| `base_url`, `transport` | Endpunkt und Transportart |
| `permissions` (jsonb) | verliehene Rechte je Server (`read`, `network`, `write`, `shell`, `filesystem`) |
| `credential_env_var` | **nur der Name** der ENV-Variable mit dem Bearer-Token |
| `cost_profile` | `free` / `metered` / `unknown` |
| `enabled` | Betriebsschalter (Kill-Switch je Server) |
| `health_status`, `health_score`, `consecutive_failures` | nachweisbarer Zustand |
| `last_checked_at`, `last_ok_at`, `last_error_at`, `last_error` | Prüfhistorie (redigiert) |
| `server_name`, `server_version` | Selbstauskunft aus `initialize` |
| `tools`, `tools_discovered_at` | Discovery-Cache, ausdrücklich keine Live-Wahrheit |

Keine Secrets in der Tabelle: der Token-Wert bleibt in der Umgebung.

### 2.2 Reine Logik — `lib/mcp-server-registry-logic.ts`

- **Validierung**: Slug (`^[a-z0-9][a-z0-9-]{1,63}$`), Anzeigename, Notizen,
  Kostenprofil, Transport, `enabled`; alle Fehler werden gesammelt, nicht nur der erste.
- **Endpunkt-Prüfung**: nur HTTPS, keine Benutzer/Passwörter in der URL, keine
  Query-Parameter (dort landen Tokens), keine Fragmente, keine privaten/lokalen
  Adressen (SSRF-Schutz aus `lib/mcp-registry-logic.ts` wiederverwendet).
- **Rechte-Defaults**: neue Server erhalten `read` + `network`. `write`, `shell`,
  `filesystem` werden **nur** mit `allowSensitivePermissions` vergeben und sonst
  namentlich als zurückgehalten gemeldet.
- **Credential-Referenz**: `^[A-Z][A-Z0-9_]{2,79}$` — ein Wert wie `sk-live-…`
  wird abgelehnt.
- **Health-Modell**: `disabled` / `unchecked` / `healthy` / `degraded` / `stale` /
  `unreachable`; Score 0–100 aus Fehlschlägen, Latenz und Alter des letzten Erfolgs.
  Drei Fehlschläge in Folge = nicht erreichbar.
- **Routing**: `server::tool`; unbekannte, deaktivierte, ungeprüfte und nicht
  erreichbare Server werden mit Klartextgrund abgelehnt; `degraded`/`stale` sind
  erlaubt, aber mit Warnung.
- **Konflikte**: gleichnamige Tools auf mehreren Servern werden sichtbar gemacht,
  nicht versteckt.
- **Redaktion**: Bearer-Token, `sk-`, `ghp_`, `github_pat_`, `xox*`, JWT, lange
  Hex-Werte und Query-Secrets werden vor jeder Speicherung/Anzeige entfernt; URLs
  werden auf Origin + Pfad gekürzt; Länge auf 300 Zeichen begrenzt.
- **Backoff**: 15 min im Regelbetrieb, nach Fehlschlägen 1/5/15/60/360 min.

### 2.3 Kanal — `server/mcp-channel.ts`

Der Streamable-HTTP-Kanal wurde aus `server/mcp-router.ts` herausgezogen (er wird
jetzt von Legacy-Pfad und Multi-Server-Service gemeinsam genutzt): JSON-RPC über
POST, `Accept` für JSON und Event-Stream, Session-Header-Übernahme, Reduktion von
SSE-Antworten auf `data:`-Zeilen, 202 = quittierte Notification, Fehler mit
HTTP-Status (404 = Sitzung abgelaufen), 10 s Timeout, optionaler Bearer-Header.
Die Legacy-Endpunkte `mcp.connect` und `mcp.callTool` verhalten sich unverändert.

### 2.4 Service — `server/mcp-server-service.ts`

Verdrahtet Store, Kanal und Sitzungs-Cache mit injizierbaren Abhängigkeiten:

| Methode | Verhalten |
|---|---|
| `listServers()` | Snapshots + Übersicht (Zustände, Durchschnitt, Toolzahl, Konflikte); DB-Ausfall → ehrliche Meldung |
| `registerServer()` | validieren, anlegen/aktualisieren, zurückgehaltene Rechte melden |
| `setEnabled()` | Betriebsschalter je Server |
| `removeServer()` | Eintrag löschen (unbekannt → ehrlicher Grund) |
| `probeServer()` | `initialize → initialized → tools/list`, Latenz messen, Health + Tools persistieren |
| `callTool()` | Routing-Gate → Rechte-Gate → Credential-Prüfung → Aufruf über Sitzungs-Cache |

Sitzungen werden **pro Server-Key** gehalten, nicht pro URL — zwei Server mit
gleicher URL teilen sich keine Sitzung.

### 2.5 API — `mcp.servers.*` (alle `adminProcedure`)

```
mcp.servers.list        query
mcp.servers.register    mutation  { key, name, baseUrl, transport?, permissions?,
                                    credentialEnvVar?, costProfile?, enabled?, notes?,
                                    allowSensitivePermissions? }
mcp.servers.setEnabled  mutation  { serverKey, enabled }
mcp.servers.remove      mutation  { serverKey }
mcp.servers.probe       mutation  { serverKey }
mcp.servers.callTool    mutation  { serverKey, toolName, args }
```

`probe` und `callTool` laufen durch die bestehende Tool-Proxy-Queue
(Concurrency-Limit, 429-Retry) — kein neuer Nebenläufigkeitsmechanismus.

## 3. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-server-registry-logic.test.ts` | 36 | Slug/ENV-Referenz, Endpunkt-Prüfung (HTTP, privat, Zugangsdaten, Query), Rechte-Defaults und Zurückhaltung, Draft-Validierung, Health (alle Zustände, Score-Grenzen), Snapshots/Übersicht, Routing, Konflikte, Redaktion, Backoff |
| `tests/mcp-server-service.test.ts` | 20 | Registrierung (neu/Update/ungültig/Rechte), Übersicht inkl. DB-Ausfall, Healthcheck (Erfolg, unbekannt, deaktiviert, SSE, fehlende Credentials, Redaktion, drei Fehlschläge), Aufruf (Erfolg, fehlende Rechte, ungeprüft, unbekannt/deaktiviert, fehlende Credentials, rote Redaktion) |

Gesamtsuite nach dem Sprint: **476 Dateien, 3.863 Tests grün** (vorher 474 / 3.807).

## 4. Ehrliche Grenzen

1. **SSE-Transport** ist registrierbar, aber nicht angebunden: `probeServer` und
   `callTool` antworten mit „SSE-Transport ist noch nicht angebunden". Keine
   Simulation, kein stiller Fallback.
2. **Kein echter Fremd-Server in diesem Lauf geprüft** — es liegt kein Endpunkt und
   keine Zugangsdaten im Repo. Der Nachweis läuft über die Tests mit Fake-Kanal und
   muss produktiv mit einem echten Server nachgeholt werden (`mcp.servers.probe`).
3. **Sitzungen sind prozesslokal** (bestehende Grenze aus Sprint 136); ein Neustart
   kostet einen zusätzlichen Handshake.
4. **Kein UI in diesem Sprint.** Die Verwaltung ist über `mcp.servers.*` erreichbar
   (Admin), die Admin-Oberfläche folgt in Sprint 9 des Master-Plans.
5. **Kein Discovery-Autopilot.** Nur Verwaltung, keine automatische Suche nach neuen
   Servern (Phase 2 zweiter Teil, Sprint 7).

## 5. Abnahme

- `npm run check`: sauber.
- `npx vitest run`: 476 Dateien, 3.863 Tests grün.
- `npm run build`: erfolgreich.
- Migration `0029_mcp_multi_server.sql` inkl. Journal-Eintrag; Ausführung erfolgt
  beim Deploy über den bestehenden Auto-Migrate-Pfad.
- Keine neuen Abhängigkeiten, keine Secrets, keine Änderung an Legacy-Verhalten.

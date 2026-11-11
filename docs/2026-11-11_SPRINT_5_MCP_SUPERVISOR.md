# Sprint 5 — Connection Supervisor: Circuit Breaker, Backoff, Ratenlimit

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 4 (Connection Supervisor)
**Status:** Implementiert, getestet, dokumentiert. Agent Factory (Sprint 6) folgt.

## 1. Ausgangslage

Nach Sprint 4 hatte jeder Aufruf drei Prüfungen: Registrierung, Governance, Zugangsdaten.
Was fehlte, war die Frage davor: **Ist der Server überhaupt erreichbar?** Ein
ausgefallener Server kostete bisher bei jedem Aufruf das volle Timeout, Fehlerlawinen
waren nicht gebremst, und „nicht erreichbar" war von „schlechter Antwort" nicht
unterscheidbar.

## 2. Reine Logik — `lib/mcp-supervisor-logic.ts`

- **Fehlerklassen** (`classifyFailure`): `unreachable`, `timeout`, `server-error`,
  `rate-limited`, `auth`, `governance`, `invalid-response`. Nur die ersten vier sind
  wiederholbar; Auth- und Governance-Fehler sind Konfigurations- bzw. Rechtefragen.
- **Circuit Breaker** je Server, optional je Werkzeug: `closed → open → half_open`.
  Schwellwert 3 Fehlversuche, Abklingzeit 60 s, genau ein Probeaufruf gleichzeitig.
  Ein `Retry-After` des Servers öffnet den Kreis sofort.
- **Wichtige Ausnahme**: Governance- und Auth-Fehler öffnen den Kreis **nicht**. Sonst
  würde eine fehlende Freigabe einen gesunden Server lahmlegen.
- **Backoff**: exponentiell, mit Jitter zwischen 50 und 100 Prozent (kein Thundering
  Herd, nie 0 ms), hart auf 30 s begrenzt; Zufall injizierbar, damit Tests deterministisch
  sind.
- **Ratenlimit**: Sliding Window über Zeitstempel, liefert die echte Wartezeit bis zum
  nächsten freien Slot.

## 3. Persistenz und Service

- **Migration `0032_mcp_circuits.sql`** + `mcp_circuits`: Zustand je
  (`server_key`, `tool_name`). Ein Verlust ist unkritisch, der Kreis startet geschlossen.
- `server/mcp-supervisor-store.ts`: Drizzle-Zugriff. Weil `NULL` in einem Unique-Index
  nicht eindeutig ist, wird erst gesucht, dann aktualisiert oder eingefügt.
- `server/mcp-supervisor-service.ts`: `gate()`, `record()`, `status()`, `reset()`.
  **Speicherfehler blockieren keine Aufrufe**: ist der Zustand nicht lesbar, wird
  durchgelassen und der Grund gemeldet — ein kaputter Zustand darf keinen Server
  abschalten.

## 4. Integration in den Aufrufpfad

`mcp.servers.callTool` prüft in dieser Reihenfolge:

1. Server aktiv und registriert (Sprint 2).
2. Governance: Rechte, Risiko, Freigabe (Sprint 3).
3. **Supervisor: Kreis offen?** → Antwort `{ ok: false, reason: "Supervisor: …", retryAfterMs }`,
   ohne Netzwerkaufruf.
4. Zugangsdaten (Sprint 4) und Aufruf.
5. Ergebnis wird verbucht: Erfolg schließt den Kreis, Fehler zählt.

## 5. API (alle `adminProcedure`)

```
mcp.supervisor.status  { serverKey? }              # Zustand, Fehlerzahl, Restzeit
mcp.supervisor.reset   { serverKey, toolName? }    # Kreis manuell schließen
```

## 6. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-supervisor-logic.test.ts` | 24 | Fehlerklassen inkl. Grenzfälle, Wiederholbarkeit, Backoff-Grenzen und Jitter, Öffnen nach Schwelle, Retry-After, exklusiver Probeaufruf, Schließen nach Erfolg, erneutes Öffnen, Governance/Auth legen nichts lahm, Statusbeschreibung, Ratenlimit inkl. Fenstergrenzen |
| `tests/mcp-supervisor-service.test.ts` | 7 | Durchlassen im Normalfall, Öffnen nach drei Fehlern mit Restzeit, Schließen nach Erfolg, Governance blockiert nicht, Probeaufruf nach Abklingzeit, Status und Rücksetzen, Durchlassen bei Speicherfehler |

Gesamtsuite: **482 Dateien / 3.975 Tests grün** (vorher 480 / 3.944).

## 7. Ehrliche Grenzen

1. **Kein automatisches Wiederaufwärmen im Hintergrund.** Der Kreis öffnet sich nur
   durch einen echten Aufruf, der die Abklingzeit abwartet; einen eigenen Liveness-Ping
   gibt es noch nicht (der Healthcheck aus Sprint 2 bleibt manuell/geplant).
2. **Kein serverweites Öffnen bei Werkzeug-Fehlern.** Ein defektes Werkzeug öffnet nur
   dessen eigenen Kreis; ein ausgefallener Server öffnet den Server-Kreis über den
   Aufruf ohne Werkzeugbezug.
3. **Ratenlimit ist Logik ohne Verdrahtung.** `checkRateLimit` ist getestet, aber noch
   nicht im Aufrufpfad aktiv — dafür fehlt eine persistente Zählerquelle.
4. **Timeouts werden nicht selbst erzwungen.** Der Supervisor klassifiziert sie, der
   Timeout kommt weiterhin aus `runMcpToolCall`.
5. **Kein Live-Ausfall getestet.** Die Zusagen sind über injizierte Zustände und Fehler
   belegt, nicht gegen einen echten toten Server.

## 8. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 482 Dateien / 3.975 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0032` inkl. Journal-Eintrag.

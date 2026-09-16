# Sprint 135 — MCP-Kachel mit echter Discovery (Dashboard)

**Datum:** 16.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 934/934 Tests grün, Server-Build erfolgreich

## Ziel

Die MCP-Kachel im Dashboard (Sprint 122) zeigte bisher nur den statischen Transportzustand. Dieser Sprint bindet sie an den echten Netzwerk-Client aus Sprint 134: Ein Klick führt den Discovery-Lauf (`mcp.connect`: initialize → tools/list) gegen den konfigurierten MCP-Server aus und zeigt das Ergebnis live — Tool-Anzahl, Server-Info und Namens-Vorschau, oder den ehrlichen Grund, wenn kein Server konfiguriert oder die Verbindung gescheitert ist.

## Umsetzung

### Reine Logik — `lib/mcp-client-logic.ts` (erweitert)

- `summarizeMcpDiscovery(report)`: bereitet ein `mcp.connect`-Ergebnis für die Kachel auf — verbunden → Statuszeile mit Tool-Anzahl (Singular korrekt), Server-Label (`"<Name> v<Version>"` aus `serverInfo`, fehlertolerant), bis zu drei Tool-Namen als Vorschau plus `+N weitere`; getrennt/nie konfiguriert → der Grund des Routers als Kopfzeile.
- Typ `McpConnectReport` als Vertrag zwischen Router und UI (strukturkompatibel zum tRPC-Ergebnis).

### UI — `app/(tabs)/dashboard.tsx`

- Neue Mutation `mcp.connect` (Admin-Bereich) mit Button „Verbinden & Tools entdecken" (deaktiviert während der Lauf); Pending-Text „Verbinde mit MCP-Server …".
- Ergebnis-Anzeige: Statuszeile (fett), Server-Zeile, Tool-Namens-Vorschau; nach erfolgreichem Lauf wird der Transport-Zustand (`mcp.transports`) mit aktualisiert.
- `mcp.connect` wirft nicht bei Verbindungsproblemen, sondern liefert `connected: false` + Grund — die Kachel zeigt genau das; nur Transportfehler (tRPC-Ebene) laufen über den Fehlerstil der Kachel (`colors.error`).

## Tests (5 neu)

- Erfolg mit 5 Tools: Statuszeile, Server-Label, Vorschau auf 3 Namen, `moreCount`.
- Singular bei 1 Tool; Server-Label ohne Version.
- Ehrliche „keine Tools"-Meldung.
- Fehlschlag → Grund als Kopfzeile, leere Vorschau.
- Fehlertolerante `serverInfo` (Nicht-Strings, Nicht-Objekte, Name+Version).

## Ehrliche Grenzen (dokumentiert)

- Ohne `MCP_SERVER_URL` liefert der Button die ehrliche Meldung „Kein MCP-Server konfiguriert" — die Kachel rät nichts.
- Die Kachel löst den Discovery-Lauf manuell aus (bewusst kein Auto-Polling): Ein realer Remote-Server würde sonst bei jedem Dashboard-Öffnen Netzwerklast erzeugen.
- Komponententests sind in der Logik-Suite bewusst nicht möglich (RN-Stubs); die Aufbereitungslogik liegt deshalb vollständig rein und getestet in der `lib`.

## Abnahme

- `npm run check` (tsc): sauber.
- `npm test`: 122 Dateien, **934/934 grün**.
- `npm run build` (Server-Bundle): erfolgreich.
- Keine Secrets; `MCP_SERVER_URL` bleibt die einzige Konfigurationsquelle.

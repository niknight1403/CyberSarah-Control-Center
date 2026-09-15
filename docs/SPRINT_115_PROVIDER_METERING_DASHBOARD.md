# Sprint 115 — Provider-Metering-Dashboard

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 726/726 Tests grün, Server-Build erfolgreich

## Ziel

Den Key-Pool (Sprint 78, Live-Integration Sprint 85) für den Admin transparent machen: Verbrauch, 429-Rate, aktiver Fallback-Pfad und nächste Rotation je Provider — ohne Log-Auswertung. Warnschwelle vor Key-Erschöpfung mit genau einer Benachrichtigung je Schwelle.

## Umsetzung

### Reine Logik — `lib/provider-metering-logic.ts`

- **`classifyProviderCall`:** HTTP-Status/Netzwerkfehler → Ledger-Kategorie (success / http-429 / http-auth / http-other / network).
- **`aggregateProviderMetering`:** rollierendes 24-h-Fenster je Quelle — Aufrufe, 429-Anzahl und -Rate, Auth-Fehler, Netzwerkfehler, Failover-Zählung mit letztem Zeitpunkt, durchschnittliche Erfolgs-Latenz. Division-durch-Null-sicher.
- **`evaluateQuotaWarnings`:** Warnschwelle 80 % Verbrauch, nur für Keys mit gemeldetem Restguthaben; `firedThresholds`-Menge (stabile ID `keyId:threshold`) stellt sicher, dass genau EINE Warnung je Schwelle und Key feuert — keine Zweimal-Alarme nach Zähler-Magie.
- **`buildProviderMeteringOverview`:** kombiniert Pool-Zustände (Status, maskiertes Label, Cooldown-Restzeit in Sekunden, Restguthaben, aktiver Fallback-Pfad als Quellen-Kette) mit den Ledger-Aggregaten zur Admin-Overview.

### Server-Adapter — `server/provider-metering.ts`

- Prozess-lokales rollierendes Ledger (Deckel 2.000 Ereignisse, 24-h-Fenster) — Betriebsstatistik seit Serverstart, analog Retrieval-Metriken (Sprint 113); ein Restart leert nur Verbrauchszahlen, der Pool-Zustand lebt in llm.ts weiter.
- `evaluateAndNotifyQuotaWarnings` versendet neue Warnungen über den Sprint-110-Alarmweg; ohne DISCORD_WEBHOOK_URL bleibt sie ehrlich "nur im Dashboard sichtbar" — gefeuert wird trotzdem einmalig.

### Live-Verdrahtung — `server/_core/llm.ts`

- Jeder verwaltete Aufruf protokolliert Erfolg/Fehler (inkl. Status) und jeden Failover (`nextSource`-Hilfsfunktion) ins Ledger.
- `getManagedPoolSnapshotForMetering`: read-only Pool-Snapshot mit maskierten Labels — niemals Voll-Keys.
- `runQuotaWarningCheck`: Quota-Schwelle nach jedem Aufruf geprüft, aber auf höchstens eine Prüfung pro Minute gedrosselt, fire-and-forget — der Hot Path wartet nicht auf Webhooks.

### Admin-Router + Dashboard

- `server/metering-router.ts` — `metering.overview` (Kombination Pool + Ledger) und `metering.checkQuotaWarnings` (manueller Auslöser), beides strikt `adminProcedure`: Standardnutzer sehen keine Key-Details.
- Dashboard-Kachel **„Provider-Metering (Admin)"**: aktive Keys / Gesamt, je Quelle Calls, 429-Rate, Cooldown-Restzeit; ehrlicher Hinweis, wenn keine verwalteten Keys konfiguriert sind.

## Tests (11 neu)

- Klassifizierung aller Status- und Fehlerfälle; Fenster-Aggregation mit 429-Rate und außen-liegenden Ereignissen; leeres Ledger.
- Quota-Warnung einmalig je Schwelle (85 %/90 %-Szenarien), still bei fehlendem Restguthaben und unter der Schwelle, stabile Warn-ID.
- Overview-Kombination: Cooldown-Restzeit, Fallback-Pfad, gefeuerte Warnungen, 24-h-Fenster.
- Server-Adapter: Ledger-Befüllung, einmalige Benachrichtigung mit ehrlichem `notified: false` bei gescheitertem Versand.

## Ehrliche Grenzen (dokumentiert)

- Das Ledger ist prozess-lokal: nach einem Server-Neustart starten die 24-h-Verbrauchszahlen bei null — Pool-Zustand (Cooldowns, erschöpfte Keys) bleibt erhalten.
- Die Quota-Warnung greift nur bei Keys, deren Provider Restguthaben meldet (`remainingCredits`); Forge/Gemini/OpenAI liefern das aktuell nicht — dann bleibt die Schwelle still statt Fake-Werte.

## Nächste Schritte (Sprint 116)

Tech-Scanner-Issues: aus den Linter-/Tech-Scanner-Protokollen reproduzierbare GitHub-Issues generieren (Label-Set, Link zu Fundstelle), damit Tech-Schulden als Issues handelbar werden statt nur als Protokollzeilen.

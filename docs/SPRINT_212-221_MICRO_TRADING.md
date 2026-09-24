# Sprint 212–221 — Micro-Trading-Analysemodul (Paper Only)

**Status:** Abgeschlossen (24.09.2026) — 10 Sprints, lokal voll validiert
(TypeScript, Lint, 1.326 Tests, Server-Build), auf `main` gepusht, CI grün.

## Ziel

Der Micro-Trading-Tab war ein statischer Platzhalter mit harten Fake-Kursen
("+1,8 %" als Konstante). Diese Sprint-Reihe baut daraus ein **rein
analytisches Paper-Modul** mit echten Kursdaten (CoinGecko, kostenlos, kein
API-Key) und einem klaren Sicherheitsversprechen:

> **Keine Order-Funktion. Keine Broker-Anbindung. Keine Wallet-Anbindung.**
> Alle Ausgaben sind Beobachtungen oder Simulationen auf historischen Daten —
> ausdrücklich keine Anlageberatung.

## Die zehn Sprints

| Sprint | Inhalt |
|---|---|
| 212 | Kern-Typen (`Candle`, `CandleSeries`), deutsche Preis-/Prozent-Formatierung, Symbol-Normalisierung (BTC, Bitcoin, BTC/USD → btc), strenge Candle-Validierung (ungültige/ungeordnete/widersprüchliche Daten werden abgelehnt statt gerechnet) |
| 213 | Deterministische Indikatoren: SMA, EMA (SMA-Seed), RSI (Wilder), annualisierte Volatilität, Gesamtveränderung — mit Warmup-Lücken statt Fake-Werten |
| 214 | Signal-Engine: SMA-Crossover + RSI-Extreme als **Beobachtungen mit Begründung und Konfidenz** (kein Kauf-/Verkaufsauftrag); ehrliches `no-signal` bei unzureichenden Daten |
| 215 | Backtest-Engine: hypothetische SMA-Cross-Strategie mit Gebühren, Win-Rate, Max-Drawdown, Buy-and-Hold-Vergleich; Caveats (zu wenige Trades, fehlende Gebühren, Simulationsschnitt am Datenende) |
| 216 | Paper-Risikorechnung: Fixed-Fractional-Positionsgröße mit Verlust-Cap, Positionsanteil-Cap, Risiko-Budget und Drawdown-Wächter |
| 217 | Deutsches Prompt-Parsing (Aktionen watchlist/analyze/signals/backtest/risk, Symbole im Fließtext, Tage- und Stop-Abstand-Klemmung, verneinte Signalaufträge) |
| 218 | Ehrlicher Ergebnis-Builder: fehlende Symbole werden benannt statt übersprungen; fester Disclaimer (Analyse, keine Anlageberatung) |
| 219 | Daten-Schicht: CoinGecko-Client mit injizierbarem fetch, 10-s-Zeitlimit, Retry nur bei transienten 5xx, 429 → Rate-Limit-Cooldown ohne Blind-Retry, Tages-Deduplizierung, JSON-Sicherheit via `fetch-safety-logic` |
| 220 | Live-Screen: Watchlist lädt echte Kurse mit sichtbaren Ladefehler-/Rate-Limit-Zuständen (keine stillen leeren Listen), Analyse-Prompt mit Ergebnis-Karte und Disclaimer; PAPER-Only-Chips bleiben |
| 221 | Abschluss: Dokumentation, CHANGELOG, volle Validierung und Push |

## Architektur-Regeln (wie Speicher-Manager 201–211)

- **Reine Logik in `lib/micro-trading-logic.ts`:** jede Entscheidung
  (Validierung, Indikatoren, Signale, Backtest, Risiko, Prompt-Parsing,
  Ergebnis-Aufbereitung) ist deterministisch und ohne I/O testbar.
- **I/O isoliert in `lib/micro-trading-data.ts`:** fetch injizierbar,
  Zeitlimit über AbortController, ehrliche sprechende Fehler, Cooldown-Zustand
  geteilt zwischen Watchlist und Analyse.
- **Kleber minimal halten in `hooks/use-micro-trading.ts`:** orchestriert nur
  Zustand und I/O; fehlgeschlagene Kurse erscheinen als einzelne ehrliche
  Zeilen, nicht als leere Liste.

## Tests

- `tests/micro-trading-logic.test.ts` — 27 Tests (Kern, Indikatoren, Signale,
  Backtest, Risiko, Prompt, Ergebnis-Builder)
- `tests/micro-trading-data.test.ts` — 5 Tests (Laden, Deduplizierung,
  Rate-Limit-Cooldown, 5xx-Backoff, ehrliche Ablehnungen)

## Bewusste Grenzen (Ehrlichkeit vor Funktionsumfang)

- Kein Intraday-Orderbuch: nur Tages-Candles, `interval=daily`.
- Backtests sind Voll-Positionen ohne Rebalancing — vereinfachte Paper-Annahme,
  im Ergebnis als hypothetisch gekennzeichnet.
- Konfidenz ist eine Heuristik zum Vergleichen von Beobachtungen, **kein**
  Wahrscheinlichkeitsmaß.
- Die Watchlist fragt CoinGecko ohne Key; bei Rate-Limit wird pausiert und der
  Zustand sichtbar gemeldet statt falsche Daten zu zeigen.

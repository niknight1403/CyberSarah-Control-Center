# Sprint 90 — Master-Agenten-Daten-Hub & Live-Dashboard

**Datum:** 14.09.2026 · **Status:** abgeschlossen · **Tests:** 621/621 grün · **TypeCheck:** sauber

## Ziel (Owner-Direktive 14.09.2026, Revenue-OS-Konzept)
CyberSarah vom Chatbot zum proaktiven Master-Agenten mit Business-Sub-Agenten
ausbauen; echte Live-Daten (Revenue, Trading, Analytics) in Dashboard und Chat;
dunkles Theme #030617 als Leitlinie.

## Umsetzung

### 1. Master-Agenten-Daten-Hub (server/data-hub.ts, tRPC dataHub)
- **Revenue-Sub-Agent:** echter Stripe-SDK-Zugriff — Gesamtbalance (EUR),
  Zahlungen der letzten 24 h, aktive Abonnements. STRIPE_SECRET_KEY-Validierung
  mit klarem "not-configured"-Status statt kryptischer Fehler.
- **Trading-Sub-Agent:** Binance oeffentliche REST-API (kein Key noetig) fuer
  BTC/ETH/SOL (Preis + 24h-Veraenderung), selbstheilend mit Retry-Backoff
  (500ms*2^n, Deckel 4s, nur bei 429/5xx).
- **Analytics-Status:** Modul-Uebersicht; externe APIs (GA4, TikTok) folgen,
  sobald Zugangsdaten vorliegen.

### 2. Reine Logik: lib/data-hub-logic.ts (+6 Tests)
- classifyBusinessDomain: Prompt -> Sub-Agent (revenue/trading/analytics/crm/
  content/general), Revenue-Keyword-Prioritaet vor Trading.
- normalizeCryptoTicker (Binance), formatCurrency ("1.248,32 €"),
  formatCryptoLine, Retry-Politik (Backoff/Deckel/Retryable-Statuses),
  Business-Tool-Schemas + Ergebnis-Formatierung.

### 3. Chat-Master-Agent erhaelt Live-Daten-Werkzeuge
- server/development-chat.ts: Agent-Loop um drei read-only Business-Tools
  erweitert (get_revenue_metrics, get_crypto_prices, get_analytics_overview) —
  "Zeige meine heutigen Einnahmen" ruft jetzt den Revenue-Sub-Agenten auf,
  der die Stripe-API zieht, statt zu raten.
- System-Prompt (lib/dev-agent-tools-logic.ts) nennt Daten-Werkzeuge explizit.

### 4. Dashboard-Tab (app/(tabs)/dashboard.tsx)
- Neuer erster Tab mit Live-Tiles: Umsatz (Stripe), Trading (BTC/ETH/SOL),
  Analytics-Module, System-Fehlerstatus — im Living-AI-Look (#030617,
  Glassmorphism-Tiles, AI-Orbs, Partikel-Feld).

### 5. Theme
- Living-Dark-Hintergrund auf #030617 gesetzt (Leitprinzip des Konzepts).

## Grenzen / was bewusst NICHT autonom moeglich ist
- HubSpot/Salesforce, GA4, TikTok/Instagram, Kraken, Perplexity, ElevenLabs,
  TikTok Symphony benoetigen Owner-API-Keys (OAuth/Secrets) — anschlussbereit,
  sobald die Zugangsdaten bereitgestellt werden (siehe Abschlussbericht).
- Stripe-Import: existierendes STRIPE_SECRET_KEY wird genutzt; ohne Key zeigt
  das Dashboard klar "Nicht konfiguriert" (keine Fake-Zahlen).

## Geaenderte Dateien
lib/data-hub-logic.ts (neu), server/data-hub.ts (neu), server/routers.ts,
server/development-chat.ts, lib/dev-agent-tools-logic.ts, lib/_core/design-theme-palettes.ts,
app/(tabs)/dashboard.tsx (neu), app/(tabs)/_layout.tsx, tests/data-hub-logic.test.ts (neu)

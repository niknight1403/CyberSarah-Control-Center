# Sprint 93 — Sub-Agenten-Explosion: GA4, HubSpot-CRM, Content-Kanäle, KI-Dienste & Kraken-Fallback

**Status:** Erledigt (14.09.2026) · **Version:** v1.3.6 · **CI:** `validate` grün

## Ziel

Der Master-Agenten-Daten-Hub (Sprint 90) deckte Revenue (Stripe) und Trading (Binance) ab.
Sprint 93 vervollständigt die Sub-Agenten-Landschaft gemäß Produktvision: **Analytics,
CRM, Content und KI-Dienste** werden als eigenständige, key-gated Sub-Agenten im
zentralen Daten-Hub implementiert — plus ein selbstheilender **Kraken-Fallback** für
Krypto-Kurse, falls Binance ausfällt.

## Was gebaut wurde

### Modul 1 — Sub-Agenten (server/data-hub.ts)

| Sub-Agent | Quelle | Modus |
|---|---|---|
| Analytics | GA4 Data API (`runReport`, 7 Tage: aktive Nutzer, Sitzungen, Conversions) | `GA4_PROPERTY_ID` + `GA4_ACCESS_TOKEN` |
| CRM | HubSpot REST (Kontakte, Neukontakte 24 h) + Salesforce-Status | `HUBSPOT_ACCESS_TOKEN` (+ optional `SALESFORCE_*`) |
| Content | TikTok Content-Posting-API (Konfigurationsstatus) + Instagram Graph (Username, Follower) | `TIKTOK_CLIENT_KEY`, `INSTAGRAM_ACCESS_TOKEN` |
| KI-Dienste | Perplexity, ElevenLabs, TikTok Symphony — Key-Status (ohne Netzaufruf, billig) | `PERPLEXITY_API_KEY`, `ELEVENLABS_API_KEY`, `TIKTOK_SYMPHONY_API_KEY` |
| Trading-Fallback | Kraken öffentliche Ticker-API, wenn Binance nicht erreichbar | kein Key nötig |

Alle folgen dem etablierten Muster: **Retry-Backoff** (500 ms · 2^attempt, Deckel 4 s,
Retries nur bei 429/5xx/Netzwerk), **klare `not-configured`-Zustände** statt haarsträubender
Fehler, **geredigtes Runtime-Logging** für die Ops-Sicht.

### Modul 2 — Master-Agenten-Routing (lib/data-hub-logic.ts)

- Drei neue Business-Tools im Chat-Master-Agenten registriert:
  `get_crm_contacts`, `get_content_channels_status`, `get_ai_services_status` —
  automatisch im Agent-Tool-Loop verfügbar (Kein Prompt-Engineering nötig, die
  Tool-Registry ist datengetrieben).
- `classifyBusinessDomain` kennt neue Schlüssel (perplexity, kraken, elevenlabs, recherche …).
- `formatBusinessResult` formatiert GA4 mit **Konversionsrate**, CRM deutsch
  (`1.248 HubSpot-Kontakte`), Kanal-/Dienstestatus kompakt — inkl.
  `formatGermanNumber` (Tausenderpunkte).
- Neue Normalisierer (reine, getestete Logik): `normalizeKrakenTicker`,
  `normalizeGa4Report`.

### Modul 3 — Dashboard (app/(tabs)/dashboard.tsx)

Drei neue Kacheln im Living-AI-Look (#030617): **Analytics (GA4, 7 Tage)** mit
Konversionsrate, **CRM (HubSpot)** mit 24-h-Neukontakten, **Content & KI-Dienste** mit
Kanal-/Dienstezählern. Jede Kachel zeigt im Nicht-Konfiguriert-Fall präzise, welcher
Key zu hinterlegen ist — kein Fake-Status.

## Selbstheilung & ehrliche Zustände

- Binance-Ausfall → automatischer Kraken-Fallback (gleiche Ticker-Normalform).
- GA4/HubSpot/Instagram-Fehler → `not-configured`/Fehlertext im Snapshot statt Absturz;
  der Chat-Agent formuliert daraus eine hilfreiche Antwort.
- Keine schreibenden Aktionen: alle Business-Tools sind Nur-Lese-Werkzeuge.

## Tests

- 625 Tests grün (+4 neu): Kraken-Normalisierung (inkl. Fehlerfall), GA4-Report-
  Normalisierung, deutsche Formatierung aller neuen Formatter, Routing neuer
  Prompts, Tool-Registry-Vollständigkeit (sechs Tools).
- Akzeptanz: `npm run check` sauber, `npm run test:coverage` grün (Lines ~50 %),
  `npm run build` erfolgreich, workspace-service-Install OK.

## Was NICHT Teil dieses Sprints ist (bewusst)

- **Major-Dependency-Sprünge** (Expo 58, RN 3.x, Vitest 5, Tailwind 4, cookie 2,
  Express 5, zod 4) bleiben laut Konvention eigene Sprints — die offenen
  Dependabot-PRs #6–#8, #12, #15, #21, #22 bleiben dafür zurückgestellt.
- **Schreibende Integrationen** (Content veröffentlichen, E-Mails versenden) brauchen
  User-Access-Tokens je Kanal und bleiben bewusst Nur-Lese bis die Freigabe steht.

## Nächste Schritte

1. API-Keys für GA4/HubSpot/Perplexity/ElevenLabs als Render-Umgebungsvariablen
   hinterlegen → Kacheln und Chat-Tools gehen ohne Codeänderung live.
2. Dependabot-Kandidaten (PRs #9–#11, #13, #14, #16–#20) nach Recreate mergen.
3. APK-Build v1.3.6 über `build-apk.yml` (signierte Release-APK + AAB als GitHub-Release).

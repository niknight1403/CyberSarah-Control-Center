# Sprint 387 — Command Dashboard: belegte Umsatzkennzahlen + Fünf-Bereiche-Navigation

**Datum:** 09.11.2026 · **Basis:** `8e90ed3` · **Bezug:** Master-Prompt Kapitel 3, 4, 9

## 1. Problem

Das Start-Dashboard zeigte Agenten, Provider und Uptime, aber keine einzige
Umsatzkennzahl. Kapitel 4.1 verlangt Umsatz, MRR, ARR, Kunden und Conversion
direkt sichtbar. Gleichzeitig zeigte die Desktop-Sidebar eine andere
Informationsarchitektur als die mobile Tab-Bar (dort „Revenue OS" und
„Business & Analytics" parallel, hier fünf Bereiche).

## 2. Umsetzung

### 2.1 Reine Kennzahlenlogik — `lib/revenue-kpi-logic.ts`

* MRR nur aus Abos mit **bekanntem Preis** (`unit_amount` + Intervall); Jahrespreise
  werden auf Monate normalisiert, Mengen eingerechnet.
* Abos ohne Preis werden **gezählt, nicht geschätzt** (`unknownPriceSubscriptions`)
  und als Lücke ausgewiesen.
* `past_due` wird separat ausgewiesen und **nicht** in den MRR gerechnet.
* Umsatz 30 Tage und Bestellungen kommen ausschließlich aus eigenen Buchungen;
  ohne Buchungen bleibt der Wert `null` (Anzeige „—"), nicht `0`.
* Durchschnittlicher Bestellwert nur bei vorhandenen Bestellungen (0/0 → `null`).
* Jede Kennzahl trägt ihre Quelle (`stripe` / `ledger` / `unavailable`) plus eine
  deutsche Klartext-Lücke.

### 2.2 Serverseite — `server/revenue-kpi-service.ts`

* **Stripe (nur lesend):** aktive, testende und zahlungsverzögerte Abos inklusive
  aufgeklappter Preise; Key-Rotation wie im Data-Hub (erster lesbarer Key gewinnt,
  Modus-Filter `live`/`test`). Mehrere Positionen werden summiert; eine Position
  ohne Preis macht den Gesamtpreis unbekannt, statt einen Teilwert zu zeigen.
* **Eigene Datenbank:** `revenue_daily_stats` (30 Tage), `conversion_events`
  (30 Tage, echte Buchungen) und `billingSubscriptions` (aktive Kunden).
* Jede Quelle scheitert unabhängig: ein Stripe-Ausfall lässt die Buchungskennzahlen
  stehen und umgekehrt. Es werden keine Secrets, Kunden- oder Zahlungsdaten geloggt.
* Neue Prozedur `revenue.kpis` — serverseitig **nur für Admins**; andere Rollen
  erhalten `status: "forbidden"` und keine Daten.

### 2.3 Oberfläche

* `components/glass/revenue-kpi-strip.tsx`: vier Kacheln (Umsatz 30 Tage, MRR, ARR,
  Kunden) im bestehenden Glass-Design, mit Quellenzeile, Lücken-Hinweis und
  „Erneut laden" bei Fehlern.
* Nur für Administratoren im Dashboard eingebunden (`isAdmin`), damit Betriebs-
  und Umsatzdaten nicht bei normalen Nutzern auftauchen.

### 2.4 Navigation

* Desktop-Sidebar (Bereich „Apps Operations") führt jetzt dieselben fünf Bereiche
  wie die mobile Tab-Bar: **Übersicht · Wachstum & Content · Umsatz & Kunden ·
  KI-Agent · Konto & System**.
* Die alten Ziele bleiben als Routen erreichbar (`/revenue-os`, `/business`,
  `/media-studio`, `/agent`, `/account`) — kein Deep-Link bricht.

## 3. Nachweise

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | keine Fehler |
| `npx vitest run tests/revenue-kpi-logic.test.ts tests/revenue-kpi-service.test.ts tests/dual-sidebar-logic.test.ts` | 23 + 6 Tests grün |
| Vollständige Suite (Basisstand vor diesem PR) | 468 Dateien / 3716 Tests grün |
| `npm run build` | erfolgreich (`dist/index.js` 1,5 MB) |
| `npx eslint` (geänderte Dateien) | keine Befunde |

## 4. Ehrliche Grenzen

* Es gibt weiterhin **keinen belegten Kundenumsatz**. Die Kacheln zeigen produktiv
  „—" mit Quellenhinweis. Das ist beabsichtigt und kein Fehler.
* MRR aus Stripe setzt einen lesbaren Stripe-Key voraus. Fehlt er, steht dort
  „keine Quelle" statt einer Schätzung.
* Leads und Conversion-Rate im Sinne von Kapitel 4.1 sind noch nicht enthalten:
  dafür fehlt eine belastbare Besucher-/Funnel-Quelle (GA4 ist nicht konfiguriert).
  Sie kommen mit der Lead-Engine (Sprint 8), sobald echte Daten fließen.

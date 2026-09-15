# Sprint 114 — Revenue-OS-Integration (read-only Sub-Agent)

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 715/715 Tests grün, Server-Build erfolgreich

## Ziel

Das Schwestersystem `cybersarah-revenue-os` (29 Agenten, Stripe, Social-Posting) als Datenquelle an den Master-Agenten-Daten-Hub anbinden statt als isoliertes System weiterlaufen zu lassen — nüchternste Anbindung zuerst: die Revenue-OS-Datenbank (Postgres/Neon) als read-only Sub-Agent (Umsatz, Content-Status, Affiliate-Klicks), analog Sprint 93. Schreib-Tools sind bewusst nicht Teil dieses Sprints.

## Datenquellen-Analyse (echtes Schwester-Repo)

Die Tabellen-Definitionen stammen aus dem Drizzle-Schema des Revenue-OS-Repos (`lib/db/src/schema/`):

| Tabelle | Gelesene Felder |
|---|---|
| `transactions` | `betrag`, `waehrung`, `quelle`, `created_at` |
| `content` | `status`, `veroeffentlicht_am` |
| `affiliate_partners` | `klick_anzahl`, `konversion_anzahl`, `gesamt_provision`, `status` |
| `customer_subscriptions` | `status` |

## Umsetzung

### Reine Logik — `lib/revenue-os-logic.ts`

- **Normalisierer:** Postgres-numeric-Strings/NULLs → Zahlen mit 0-Fallback; Zeilen-Extraktion toleriert leere Results.
- **`buildRevenueOsSnapshot`:** Umsatz 24 h (EUR) + Transaktionszahl, Gesamtumsatz, stärkste Quelle (7 Tage), Content-Zählung je Status, Affiliate-Klicks/-Konversionen/Provisionssumme/aktive Partner, aktive Subscriptions — rein, ohne DB.
- **`formatRevenueOsSnapshot`:** kompakte deutsche Modell-Antwort; not-configured nennt präzise das fehlende Secret, error die Ursache.
- **`describeRevenueOsError`:** klassifiziert DB-Fehler (fehlende Tabellen → Migrations-Hinweis auf die Neon-DB; Auth; Timeout/verweigert; sonst generisch-ehrlich).
- **`REVENUE_OS_QUERIES`:** alle SQL-Konstanten an einem testbaren Ort — nur SELECTs mit `COALESCE`-Aggregaten und LIMIT-Deckel.

### Sub-Agent — `server/revenue-os.ts`

- Eigene, **getrennte** Umgebungsvariable `REVENUE_OS_DATABASE_URL` — Geheimnistrennung zur `DATABASE_URL` des Control Centers bleibt gewahrt.
- **Strikt read-only auf zwei Ebenen:** Session-Flag `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` + ausschließlich die getesteten SELECT-Konstanten (ein Test prüft das).
- Lazy gecacheter `pg`-Client, SSL für Neon, Statement-/Query-Timeout 5 s; bei Verbindungsfehlern wird der Cache resettet (selbstheilend beim nächsten Aufruf).
- Ehrliche Zustände: `not-configured` ohne Secret (kein Netzaufruf), `error` mit klassifizierter Ursache.

### Verdrahtung

- `server/data-hub.ts` — Snapshot in `dataHub.dashboard` (parallel zu den anderen Sub-Agenten); Business-Tool `get_revenue_os_overview` registriert.
- `lib/data-hub-logic.ts` — Tool-Name/-Beschreibung im Chat-Master-Agenten (datengesteuerte Tool-Registry), Formatter über `formatRevenueOsSnapshot`; Domain-Routing: „affiliate", „provision", „partnerprogramm", „revenue-os" → Revenue-Domäne.
- Dashboard-Kachel **„Revenue-OS (read-only)"** — Umsatz 24 h, Affiliate-Klicks/Partner, Content-Status-Zusammenfassung; not-configured zeigt präzise, welches Secret fehlt (kein Fake-Status).

## Tests (12 neu + 1 erweitert)

- Normalisierung (numeric-String, Zahl, NULL, Müll), Null-Snapshot bei leerer DB, volle Rohdaten, NULL-Spalten ohne NaN.
- Formatierung aller drei Zustände (not-configured nennt das Secret, error die Ursache, ok deutsch mit Tausenderpunkten).
- Fehlerklassifikation (fehlende Relation → Neon-Hinweis, Auth, ETIMEDOUT/ECONNREFUSED, generisch).
- **Nur-Lese-Garantie:** jede SQL-Konstante ist ein SELECT ohne Schreib-Schlüsselwörter (Wortgrenzen, damit `created_at` nicht anschlägt).
- Routing: Affiliate-/Provision-/Revenue-OS-Prompts landen in der Revenue-Domäne.
- Sprint-90-Tool-Registry-Test auf sieben Tools erweitert.

## Live-Bedingung (ehrlich dokumentiert)

`REVENUE_OS_DATABASE_URL` liegt weder im Secret-Speicher noch ist der Revenue-OS-Server (HTTP/80) aus dieser Umgebung erreichbar — die Kachel zeigt daher den klaren not-configured-Zustand. **Live-Gang ohne Codeänderung:** die Neon-URL der Revenue-OS-Datenbank (liegt auf dem Revenue-OS-Server in dessen Umgebung) als `REVENUE_OS_DATABASE_URL` in den Render-Umgebungsvariablen hinterlegen. Die Integration liest ausschließlich über die vier migrierten Tabellen der Drizzle-Schemas — ist eine Tabelle (noch) nicht migriert, klassifiziert der Sub-Agent das als klaren Migrations-Hinweis.

## Was NICHT Teil dieses Sprints ist (bewusst)

- **Schreib-Tools** (Content-Erstellung anstoßen, Affiliate-Auszahlungen) bleiben zurückgestellt — sie brauchen laut Roadmap ein guarded Business-Tool mit Human-in-the-Loop für alles Finanzielle (Revenue-OS-Konvention).
- Eigene Actions im GitHub-Workflow sind unnötig: der Snapshot ist on-demand (Dashboard/Chat), keine geplante Aggregation.

## Nächste Schritte (Sprint 115)

Provider-Metering-Dashboard: den Key-Pool (Sprint 78) transparent machen — Aufrufe, 429-Rate, aktiver Fallback-Pfad, nächste Rotation je Provider als Admin-Kacheln, Warnschwelle vor Key-Erschöpfung.

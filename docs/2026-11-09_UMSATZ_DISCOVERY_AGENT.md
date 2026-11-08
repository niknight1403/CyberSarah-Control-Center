# Umsatz-Discovery-Agent & Autopilot-Katalog (09.11.2026)

Auftrag: ein Agent, der autonom nach neuen oder integrierbaren
Umsatzmoeglichkeiten sucht und sie integriert — plus Autopiloten, ueberall wo
sie sinnvoll sind.

## Was der Agent wirklich tut

Er durchsucht **die eigenen Signale**, bewertet sie nachvollziehbar und legt
fuer die lohnendsten Kandidaten einen Ideen-Entwurf zur Freigabe an:

```
Signale sammeln → bewerten (5 Kriterien) → einstufen → Entwurf (pending)
```

Sechs Quellen, jede mit Herkunft und Beleg:

| Quelle | Herkunft | Automation |
| --- | --- | --- |
| `affiliate-catalog` | Tabelle `affiliate_products` (Score, Provision) | Autopilot |
| `offer-gap` | `revenue_offers` gegen die acht Hubs | Autopilot |
| `loop-gap` | Loop-Entwuerfe der Draft-Queue | Autopilot |
| `integration-gap` | Integrations-Registry (ENV-Readiness) | Autopilot |
| `partner-signal` | B2B-Netzwerk, dokumentiertes Interesse | mit Unterstuetzung |
| `marketplace-scan` | Plattform-API mit Provisionsdaten | mit Unterstuetzung |

## Bewertung

Fuenf Signale, gewichtet:

| Kriterium | Gewicht | Frage |
| --- | --- | --- |
| Nachfrage | 0,30 | Gibt es ein belegtes Signal (Score, Anfrage, Verkauf)? |
| Passung | 0,25 | Passt es zu Hub, Persona und Zielgruppe? |
| Marge | 0,20 | Provision oder Marge bekannt? |
| Aufwand | 0,15 | Wie schnell ist ein Test moeglich? |
| Risiko | 0,10 | Rechtlich, Reputation, Abhaengigkeit |

Zwei harte Deckel machen "integrierbar" zu einer Aussage ueber Belege:

1. **Ohne vollstaendige Belege kein `integrate`.** Fehlt die Provision oder der
   Nachfragewert, wird der Kandidat auf `test` heruntergestuft.
2. **Sicherheit unter 40 Punkten deckelt auf `test`.** Ein lohnender, aber
   riskanter Weg wird erst getestet, nicht integriert.

Einstufungen: `integrierbar` (>= 70 mit Belegen), `testen` (50-69 oder Belege
fehlen), `beobachten` (30-49), `verwerfen` (< 30).

## Grenzen der Automatik

Der Agent legt **nur Ideen-Entwuerfe** an (`draftQueue`, `pending`). Er legt
keine Produkte an, aendert keine Preise, startet keine Kampagnen und schreibt
niemanden an. Jeder Entwurf nennt:

- Quelle und Herkunft,
- den Umsatzweg,
- den konkreten naechsten Schritt (z. B. "fehlende Konfiguration setzen:
  STRIPE_SECRET_KEY"),
- die Belege und die offenen Punkte,
- den Hinweis, dass es **keine Umsatzprognose** ist.

Damit ist die Arbeit autonom und die Entscheidung menschlich.

## Autonomie: wo der Agent laeuft

`runRevenueDiscovery()` ist Teil von `runControlCenterAutopilot()`, also alle
zwei Stunden ueber `.github/workflows/control-center-autopilot.yml` und nach
jedem Deploy.

Schutz gegen Wildwuchs:

- hoechstens **4 Entwuerfe pro Lauf**,
- `dedupeKey = discovery:<quelle>:<subjekt>:<jahr>-W<woche>` plus Unique-Index,
- bereits vorgelegte Kandidaten werden uebersprungen,
- nur Quellen mit `automation: autopilot` werden automatisch ausgewertet.

## Autopilot-Katalog

`lib/autopilot-registry-logic.ts` beschreibt jeden Lauf mit Trigger,
Verdrahtungs-Referenz, Kadenz, Schreibzugriff und Absicherung — und sagt
ausdruecklich, wo Automatik **nicht** sinnvoll ist. Details und Regeln:
`docs/2026-11-09_AUTOPILOT_KATALOG.md`.

| Lauf | Trigger | Status |
| --- | --- | --- |
| Control-Center (Dachlauf) | Cron `17 */2 * * *` + nach jedem Deploy | aktiv |
| Hub-Entwuerfe | Kind des Dachlaufs | aktiv |
| Umsatz-Discovery | Kind des Dachlaufs | aktiv |
| Revenue-Loop | Cron `40 5 * * *` | aktiv |
| Publishing | Server-Timer, 60 s | aktiv |
| Outreach-Worker | Route, Freigabe noetig | aktiv |
| Integrations-Audit | Cron `15 6 * * *` | aktiv |
| Tech-Scanner | Cron `30 5 * * *` | aktiv |
| Integrations-Health | Route, auf Abruf | empfohlen (Alarmkanal fehlt) |
| Marktplatz-DauerScan | manuell | empfohlen (API-Zahlen fehlen) |
| Automatische Preisoptimierung | manuell | **nicht sinnvoll** (zu wenig Messvolumen) |

`autopilots.overview` (protected) liefert Katalog, Kinder je Dachlauf,
`issues` aus `validateAutopilotCatalog` und `nextSensibleStep`.
`autopilots.validate` gibt nur die Regelverstoesse zurueck.
`tests/autopilot-catalog-wiring.test.ts` prueft jede Referenz gegen den
echten Workflow, Cron-Ausdruck, Timer oder die Aufrufstelle im Repo — der
Katalog kann also nicht veralten, ohne dass die Suite rot wird.

## tRPC-API `revenueDiscovery`

| Procedure | Typ | Zweck |
| --- | --- | --- |
| `sources` | protected query | Quellen, Gewichte, Einstufungs-Labels |
| `candidates` | protected query | bewertete Kandidaten, ohne Schreiben |
| `score` | protected query | eigene Signale durchrechnen |
| `run` | admin mutation | `dryRun` Default `true` |

## Erwarteter erster Lauf

Beim ersten Lauf sind die wahrscheinlichsten Treffer:

1. rote Zahlungs-/Mail-Integrationen (`integration-gap`) — belegt und
   sofort handlungsfaehig,
2. Bereiche mit offenen Entwuerfen aber ohne aktives Angebot (`offer-gap`),
3. Affiliate-Produkte mit Score und Provision, aber ohne Content-Loop
   (`affiliate-catalog`).

Alles andere bleibt `beobachten` oder `verwerfen`, bis ein echtes Signal
dazukommt. Das ist gewollt: ein Agent, der immer etwas findet, findet auch
Unsinn.

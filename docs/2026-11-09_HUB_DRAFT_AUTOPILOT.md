# Hub-Entwuerfe & Loop-Engineering (09.11.2026)

Auftrag: fuer jeden Geschaeftsbereich die noetigen Entwuerfe, Loop-Engineering
als Umsatzmechanik, und die KI-Persoenlichkeiten autonom daran arbeiten lassen.

## Die Grundidee

Ein einzelner Post erzeugt keine Umsaetze. Erst der geschlossene Kreis tut es:

```
attention → trust → offer → reuse → (zurueck zu attention)
```

Deshalb ist die Einheit hier nicht "der Entwurf", sondern die **Stufe im Loop**.
Ein Hub gilt erst als versorgt, wenn alle vier Stufen besetzt sind. Drei
Aufmerksamkeits-Posts ersetzen kein Angebot, und ein Angebot ohne Vertrauens-
stufe konvertiert nicht.

## Acht Bereiche, feste Zuordnung

| Hub | Zweck | Personas | Metrik |
| --- | --- | --- | --- |
| `hara` | Ueberforderung → naechster Schritt | Mira, Lina | Anmeldungen pro 100 Sitzungen |
| `saas` | Werkzeuge, die Arbeit verkuerzen | Juno, Nova | Aktivierungen pro 100 Besuche |
| `loop` | Aufmerksamkeit in Kreislauf ueberfuehren | Juno, Zara | Wiederkehrende Besucher pro 100 Erstbesucher |
| `trading` | Risiko und Begriffe erklaeren | Kaya | Abschluesse pro 100 Sitzungen |
| `reach` | Reichweite systematisch testen | Zara, Lina | Haltequote der ersten drei Sekunden |
| `faceless` | Kanaele ohne Gesicht, mit Haltung | Nova, Zara | Wachstum pro Clip |
| `b2b` | Aus Kontakten Partnerschaften | Juno, Nova | Antwortquote auf Erstansprache |
| `affiliate` | Empfehlungen, die auch ohne Kauf nuetzen | Lina, Kaya | Provision pro 100 qualifizierten Klicks |

Jede Stufe hat Zweck, Formate und einen Handlungsaufruf. Die Zuordnung zur
bestehenden Revenue-Achse (`hara`, `saas`, `loop`, `trading`) bleibt erhalten:
Reichweiten-Hubs monetarisieren ueber `loop`, B2B ueber `saas`, Affiliate ueber
`hara`.

## Was autonom laeuft

`runControlCenterAutopilot()` enthaelt jetzt den Schritt
`runHubDraftAutopilot()`. Der Autopilot laeuft alle zwei Stunden ueber
`.github/workflows/control-center-autopilot.yml` →
`POST /api/cron/control-center-autopilot`.

Pro Lauf:

1. offene Entwuerfe aus der Queue lesen (Ist),
2. fehlende Stufen je Hub bestimmen (Soll),
3. **eine** Stufe pro Hub anlegen (Rotation ueber den Tag, damit die Queue
   nicht mit 32 Entwuerfen auf einmal volllaeuft),
4. je Revenue-Hub einen Loop-Engineering-Entwurf sicherstellen.

Deduplizierung: `dedupeKey = hub-draft:<hub>:<stufe>:<jahr>-W<woche>` plus
Unique-Index auf `draftQueue.dedupeKey`. Ein Lauf kann dieselbe Stufe nicht
doppelt anlegen; nach einer Woche darf sie neu entstehen.

Grenzen: `DRAFT_MAX_PENDING_BY_KIND` gilt weiter (24 Inhalte, 4 Loop-Entwuerfe).
Ist das Limit erreicht, ueberspringt der Lauf die restlichen Stufen und meldet
das im Autopilot-Ergebnis als Wartestand, nicht als Fehler.

## Wo die Grenze zur Aussenwirkung liegt

Der Autopilot **schreibt ausschliesslich `pending`-Entwuerfe**. Kein Posting,
kein Versand, keine Preis- oder Budgetaenderung. Veroeffentlichung passiert
weiterhin nur nach menschlicher Freigabe (`draft-engine-router`,
`publishing-review`). Autonom ist das Denken, kontrolliert das Handeln.

## Wahrheitsregel

Entwuerfe enthalten **keine erfundenen Zahlen**. Der Text nennt:

- den Zweck des Hubs,
- die Stufe und was sie leisten soll,
- die Metrik, an der gemessen wird,
- die **Messluecke** in Klartext ("Klicks und Abschluesse je Kanal fehlen").

Loop-Entwuerfe tragen `baseline: "keine Messdaten vorhanden"` statt einer
Zielzahl. Die Persona-Transparenz (`disclosure`) steht in jedem Entwurf, damit
KI-Persoenlichkeiten nie als Menschen erscheinen.

## tRPC-API `hubDrafts`

| Procedure | Typ | Zweck |
| --- | --- | --- |
| `hubs` | protected query | Bereiche mit Zweck, Metrik, vier Stufen |
| `coverage` | protected query | Ist-Abdeckung je Hub/Stufe, optional `hub` |
| `preview` | protected query | Was der naechste Lauf anlegen wuerde (ohne Schreiben) |
| `personas` | protected query | Persona → Bereiche inkl. Transparenzhinweis |
| `loops` | protected query | Loop-Engineering-Hypothesen je Bereich |
| `run` | admin mutation | `dryRun` Default `true`; echte Entwuerfe nur mit `dryRun: false` |

`coverage.coveragePct` zaehlt besetzte **Stufen**, nicht die Menge der
Entwuerfe: `8/32 = 25 %` heisst, jeder der acht Bereiche hat genau eine Stufe.

## Erste Messung nach dem Deploy

Der ehrliche Startzustand ist `0 %` — die Abdeckung entsteht erst mit den
Laeufen. Nach acht Stunden sollte jeder Bereich alle vier Stufen besitzen
(32 Stufen), danach sind Freigaben der Engpass, nicht die Produktion. Das ist
gewollt: die Queue-Limits verhindern, dass Entwuerfe ein Nest bauen, das
niemand prueft.

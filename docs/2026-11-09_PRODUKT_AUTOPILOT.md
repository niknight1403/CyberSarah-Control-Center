# Produkt-Autopilot (09.11.2026)

Der Autopilot legt Produkte selbststaendig bei Digistore24 an: Produkt, Preisplan
und Katalogeintrag im eigenen Dashboard. Er verkauft nichts und erfindet nichts.

## Bausteine

| Teil | Datei |
|---|---|
| Reine Logik (Auswahl, Parameter, Antworten) | `lib/product-autopilot-logic.ts` |
| Ablauf, Netzwerk, Datenbank | `server/product-autopilot.ts` |
| Ideenkatalog (versioniert, mit Begruendung) | `lib/product-ideas.ts` |
| Endpunkte | `server/_core/index.ts` |
| Zeitplan | `.github/workflows/product-autopilot.yml` |
| Tests | `tests/product-autopilot.test.ts` (21) |

## Endpunkte

Beide mit `Authorization: Bearer $METRICS_TOKEN`, wie die uebrigen Cron-Routen.

```
POST /api/cron/product-autopilot
  { "maxProducts": 1, "dryRun": false, "force": false }

GET  /api/product-autopilot/status
```

## Ein Lauf

1. Ohne `DIGISTORE24_API_KEY` bricht der Lauf mit `mode: blocked` ab. Kein Erfolg
   ohne Schluessel.
2. Tageslauf-Sperre ueber `revenue_jobs.dedupe_key = product-autopilot:<Datum>`.
   Ein zweiter Lauf am selben Tag wird abgelehnt, ausser `force: true`.
3. `listProducts` bei Digistore24 lesen: existiert ein Produkt mit gleichem Namen
   schon, wird die Idee uebersprungen (`already_remote`). Das schuetzt auch dann
   vor Doppeln, wenn die lokale Zeile fehlt.
4. Je faelliger Idee: `createProduct` (Typ Software, EUR, deutsch, Suche aus),
   dann `createPaymentPlan` (gleiche Rate, Laufzeit unbegrenzt, kuendbar).
5. Ergebnis in `revenue_offers` (`kind = digistore24_product`, Status
   `awaiting_approval`, `metadata` mit Produkt-/Plan-ID und Begruendung) und in
   `affiliate_products` (`slug = ds24-<Produkt-ID>`), damit das Dashboard das
   Produkt kennt, bevor der erste Verkauf eintrifft.

Fehler werden je Idee festgehalten (`status = retry`, ab dem dritten Versuch
`failed`), ein Fehlschlag stoppt die anderen Ideen nicht.

## Warum der Katalog im Build steckt

Der Server laeuft als gebuendeltes `dist/index.js`. Ein relativer Pfad zu einer
JSON-Datei war dort nicht verlaesslich vorhanden (erster Produktionslauf: "Ideenkatalog
nicht gefunden", Status `blocked`). Der Katalog liegt deshalb als TS-Modul
`lib/product-ideas.ts` und reist im Build mit. Fuer Sonderfaelle laesst sich per
`PRODUCT_IDEAS_FILE` eine JSON-Datei davorlegen; der Status-Endpunkt nennt die
benutzte Quelle (`ideasSource`).

## Grenzen, absichtlich

- **Freigabe bleibt manuell.** Digistore24 gibt Produkte erst nach Freigabe im
  Konto frei; ein API-Schreibversuch auf `approval_status` wird quittiert, aendert
  aber nichts. Der Autopilot legt an, der Mensch gibt frei.
- **Obergrenzen.** Hoechstens 3 Produkte je Lauf, 20 insgesamt. Ein Autopilot ohne
  Deckel produziert Muell.
- **Ideen sind kuratiert.** `lib/product-ideas.ts` enthaelt Begruendung und
  ein `approved`-Flag. Ideen ohne Freigabe (z. B. Scale) bleiben liegen, bis
  Starter und Pro Umsatz zeigen.
- **Keine Umsatzerfindung.** Neue Produkte starten mit 0 Verkaeufen und 0 EUR.
  Umsatz entsteht erst durch echte IPNs.

## Betrieb

```bash
# Trockenlauf: nur planen
curl -s -X POST -H "Authorization: Bearer $METRICS_TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun":true}' https://app.cybersarah-ki.com/api/cron/product-autopilot

# Echter Lauf, ein Produkt
curl -s -X POST -H "Authorization: Bearer $METRICS_TOKEN" -H "Content-Type: application/json" \
  -d '{"maxProducts":1}' https://app.cybersarah-ki.com/api/cron/product-autopilot

# Status
curl -s -H "Authorization: Bearer $METRICS_TOKEN" \
  https://app.cybersarah-ki.com/api/product-autopilot/status
```

Zeitplan: taeglich 07:15 UTC, zusaetzlich manuell per `workflow_dispatch`
(`maxProducts`, `dryRun`, `force`).

# HubSpot-Anbindung: Validierungsbericht

Stand: 1. November 2026. Prüfbar mit `npm run hubspot:check`.

## Ergebnis

**Bestanden.** Die Verbindung steht, das Portal ist bestätigt, Lese- und
Schreibzugriffe funktionieren. Ein echter Round-Trip mit Anlegen, Zurücklesen,
Stage-Wechsel und Löschen von Testdatensätzen lief erfolgreich; das Portal ist
danach wieder im Ausgangsbestand.

## Portal

| Prüfung | Ergebnis |
| --- | --- |
| Portal-ID laut Schlüssel | 148844654 |
| Abgleich mit Portal aus der URL (`app-eu1.hubspot.com/service-keys/148844654`) | stimmt |
| Rechenzentrum | EU, `https://api-eu1.hubapi.com` |
| Zeitzone | US/Eastern |
| Währung | USD |

## Schlüssel

| Variable | Zustand | Bewertung |
| --- | --- | --- |
| `HUBSPOT_SERVICE_KEY` | 44 Zeichen, `pat-eu1-…` | gültig, wird genutzt |
| `HUBSPOT_ACCESS_TOKEN` | 107 Zeichen, kein `pat-`-Präfix | ungültig (401) |
| `HUBSPOT_API_KEY` | 36 Zeichen, kein `pat-`-Präfix | ungültig (401) |
| `HUBSPOT_PORTAL_ID` | UUID statt Ziffernfolge | ungültig, ungenutzt |

Die drei letztgenannten Variablen sollten gelöscht werden, damit kein Pfad
versehentlich auf sie zurückfällt. `HUBSPOT_SERVICE_KEY` gewinnt ohnehin, weil
das Modul Werte ohne `pat-`-Format ablehnt.

## Bestand im Portal

| Objekt | Datensätze |
| --- | --- |
| Kontakte | 2 |
| Firmen | 1 |
| Deals | 0 |
| Deal-Pipelines | 1 (`Sales Pipeline`, 7 Stages) |

## Rechte-Matrix

| Recht | Zustand | Nachweis |
| --- | --- | --- |
| Kontakte lesen | vorhanden | `GET /crm/v3/objects/contacts` → 200 |
| Firmen lesen | vorhanden | `GET /crm/v3/objects/companies` → 200 |
| Deals lesen | vorhanden | `GET /crm/v3/objects/deals` → 200 |
| Deal-Pipelines lesen | vorhanden | `GET /crm/v3/pipelines/deals` → 200 |
| Kontostammdaten lesen | vorhanden | `GET /account-info/v3/details` → 200 |
| Owner lesen | vorhanden | `GET /crm/v3/owners` → 200 |
| Kontakte schreiben | vorhanden | Anlegen + Zurücklesen + Löschen bestätigt |
| Firmen schreiben | vorhanden | `PATCH` auf Probe-ID → 400 (Autorisierung passiert) |
| Deals schreiben | vorhanden | Anlegen, Stage-Wechsel, Löschen bestätigt |

Schreibrechte prüft `npm run hubspot:check` über ein `PATCH` auf die erfundene
ID `999999999999999999`: 403 bedeutet "Scope fehlt", 400 oder 404 "Scope
vorhanden" (die Autorisierung hat dann bereits stattgefunden). Es wird dabei
nichts angelegt oder verändert.

Den vollständigen Beweis liefert `npm run hubspot:write-check`: legt einen
Kontakt und einen Deal an, liest den Kontakt zurück, verschiebt die
Deal-Stage und löscht beide Datensätze wieder. Der Aufruf ist idempotent und
hinterlässt keine Daten.

Ergänzte Scopes am Service Key (Development → Keys → Service keys → Edit):

```
crm.objects.contacts.write
crm.objects.companies.write
crm.objects.deals.write
crm.objects.owners.read
```

Alle vier sind aktiv, geprüft am 1. November 2026 um 02:45 Uhr.

## Technischer Stand im Repo

| Bereich | Zustand |
| --- | --- |
| Modul | `server/integrations/hubspot` mit Client, Service, Sandbox, Diagnose |
| Tokenvorrang | `HUBSPOT_SERVICE_KEY`, dann Private-App-, Access-Token-, API-Key-Alias |
| Rechenzentrum | aus Tokenpräfix abgeleitet, `HUBSPOT_API_BASE_URL` übersteuert, Fremdhosts werden abgewiesen |
| Fehlerbilder | 403 nennt den vermutlich fehlenden Scope |
| Tests | 2886 grün, `tsc` ohne Fehler, Build erfolgreich |
| Abnahme | erfüllt: `hubspot:check` meldet "Schreibzugriff insgesamt: vorhanden", `hubspot:write-check` läuft durch |

## Nächster Schritt

Die Anbindung ist abgenommen. Offen ist nur noch die Verdrahtung des
MRR-Dashboards im Admin-UI gegen die echten Deals und Owner.

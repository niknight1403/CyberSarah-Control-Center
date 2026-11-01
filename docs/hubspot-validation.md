# HubSpot-Anbindung: Validierungsbericht

Stand: 1. November 2026. Prüfbar mit `npm run hubspot:check`.

## Ergebnis

**Bedingt bestanden.** Die Verbindung steht, das Portal ist bestätigt, alle
Leseoperationen funktionieren. Schreibzugriffe sind nicht möglich, deshalb
bleiben Lead-Import, Deal-Anlage und MRR-Pflege gesperrt.

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
| Owner lesen | fehlt | 403 `MISSING_SCOPES` |
| Kontakte schreiben | fehlt | `PATCH` auf Probe-ID → 403 |
| Firmen schreiben | fehlt | `PATCH` auf Probe-ID → 403 |
| Deals schreiben | fehlt | `PATCH` auf Probe-ID → 403 |

Schreibrechte werden über ein `PATCH` auf die erfundene ID
`999999999999999999` geprüft: 404 bedeutet "Scope vorhanden", 403 "Scope
fehlt". Es wird dabei nichts angelegt oder verändert.

Fehlende Scopes für den Service Key (Development → Keys → Service keys → Edit):

```
crm.objects.contacts.write
crm.objects.companies.write
crm.objects.deals.write
crm.objects.owners.read
```

## Technischer Stand im Repo

| Bereich | Zustand |
| --- | --- |
| Modul | `server/integrations/hubspot` mit Client, Service, Sandbox, Diagnose |
| Tokenvorrang | `HUBSPOT_SERVICE_KEY`, dann Private-App-, Access-Token-, API-Key-Alias |
| Rechenzentrum | aus Tokenpräfix abgeleitet, `HUBSPOT_API_BASE_URL` übersteuert, Fremdhosts werden abgewiesen |
| Fehlerbilder | 403 nennt den vermutlich fehlenden Scope |
| Tests | 2885 grün, `tsc` ohne Fehler, Build erfolgreich |
| Abnahme | `npm run hubspot:check` muss "Schreibzugriff insgesamt: vorhanden" melden |

## Offener Schritt

Scopes im Portal ergänzen, Service Key neu kopieren falls HubSpot ihn nach dem
Bearbeiten nicht weiterverwendbar lässt, Wert als `HUBSPOT_SERVICE_KEY`
hinterlegen, `npm run hubspot:check` ausführen. Erst wenn dort alle neun
Prüfungen `ok` zeigen und "Schreibzugriff insgesamt: vorhanden" steht, ist die
Anbindung abgenommen und das MRR-Dashboard kann live verdrahtet werden.

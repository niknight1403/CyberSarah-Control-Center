# Publishing: Was "beim Menschen" bedeutet

Stand 11.11.2026. Gilt fuer den Aufloesungslauf
`.github/workflows/publishing-resolution.yml` -> `POST /api/cron/publishing-resolution`.

## Die drei Ausgaenge

| Ergebnis | Bedeutung | Folge |
| --- | --- | --- |
| `bestaetigt` | Beitrag auf der Plattform gefunden | Job wird geschlossen |
| `geschlossen` | Frist abgelaufen, nichts gefunden | Job wird geschlossen |
| `beim Menschen` | Pruefung lief, ergab aber kein Urteil | Job bleibt offen, `lastError` nennt den Grund |
| `Zugang blockiert` | Der Zugang selbst ist unbrauchbar | Job bleibt offen, KEIN `lastError`, kein Handlungseintrag je Vorgang |

## Warum es "Zugang blockiert" gibt

Ein abgelehnter Token ist kein Befund ueber einen Beitrag. Vorher meldete der
Lauf 19 identische Faelle "Pruefung nicht moeglich" — eine Zahl, aus der
niemand einen Schritt ableiten kann.

Der Lauf entscheidet am ersten echten Befund: liefert eine Pruefung
`unverifiable` mit `HTTP 401`, `invalid_grant` oder `invalid_request`, gilt die
Plattform fuer diesen Lauf als blockiert. Weitere Vorgaenge derselben Plattform
werden gezaehlt und uebersprungen.

Der Log zeigt dann:

```
Aufloesung: geprueft=1 bestaetigt=0 geschlossen=0 wartend=0 beim Menschen=0
  Zugang blockiert: x=19
  Blocker: x: X lehnt den Token ab (HTTP 401): env: X-Refresh fehlgeschlagen (400): invalid_request Value passed for the token was invalid.
```

## Handlung bei blockiertem X-Zugang

1. X-App mit OAuth2 (confidential client) und den Scopes
   `tweet.read users.read offline.access tweet.write` autorisieren.
2. Den neuen `refresh_token` als `X_REFRESH_TOKEN` setzen (Render-Env) — X
   invalidiert bei jedem Refresh den alten Wert, deshalb ist die Env nur Bootstrap.
3. Naechster Lauf: der Vorflug schreibt den rotierten Satz in `platform_tokens`,
   die 19 offenen Jobs werden geprueft und je nach Befund bestaetigt oder
   nach Fristablauf geschlossen.

Ein toter Refresh-Token laesst sich nicht durch Code reparieren: die
Verifikation fragt jetzt ehrlich nach dem Grund, statt einen Blind-Verdacht zu
aeussern.

## Grenzen

- `beim Menschen` ist kein Fehlerzustand, sondern eine Warteschlange.
- Es werden hoechstens 25 Vorgaenge je Lauf geprueft (`AUTO_RESOLUTION_BATCH`).
- Ohne gespeicherten Sendetext wird nicht geraten: dann bleibt der Vorgang offen
  und der Grund lautet "Sendetext nicht gespeichert".

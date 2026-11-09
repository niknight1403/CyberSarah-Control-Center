# X-Token-Erneuerung repariert, fehlgeschlagene Jobs kontrolliert wiederaufgenommen (09.11.2026)

## Befund

`server/x-token-service.ts` konnte einen Refresh nur mit EINEM Kandidaten
versuchen: dem Refresh-Token aus `platform_tokens`. Existierten zwei Quellen
(DB-Zeile und `X_REFRESH_TOKEN` aus der Umgebung), wurde die zweite nie benutzt.
Stammte der DB-Satz aus einer abgebrochenen Rotation, scheiterte jeder Refresh mit
`invalid_grant`, obwohl in der Umgebung ein gueltiger Bootstrap lag.

Zweiter Fehler: `resolveXToken` gab im Fallback auch einen nachweislich
abgelaufenen DB-Token zurueck. Der Versand lief damit garantiert in ein 401 —
und der Job landete als "fehlgeschlagen" in der Queue, ohne dass die Ursache
sichtbar wurde.

Dritter Punkt: Die vorhandene Wiederaufnahme (`retryFailedPublishingJobs`) ist
nutzergebunden und setzt bei ALLEN fehlgeschlagenen Jobs `attempts` auf 0 —
auch bei inhaltlichen Ablehnungen, die durch Wiederholung nicht besser werden.

## Aenderungen

### X-Token (`server/x-token-service.ts`)

- Zwei Kandidaten in Reihenfolge DB, dann `X_REFRESH_TOKEN`, entdoppelt.
  Bei `invalid_grant`/4xx wird der naechste Kandidat versucht; bei 5xx/Netzfehler
  nicht (der Endpunkt ist gestoert, nicht der Token).
- Basic-Auth nach RFC 6749 prozentkodiert.
- Kein abgelaufener DB-Token mehr als gueltig: Fallback ist der Env-Bootstrap,
  sonst ehrlich `token: null` mit Grund.
- Neue Diagnose `xTokenDiagnostics()`: Quellen, Restlaufzeit, letzter Fehler,
  letzter erfolgreicher Refresh und dessen Quelle — ohne Geheimnisse.

### Wiederaufnahme (`lib/publishing-retry-logic.ts`, `server/publishing-retry-service.ts`)

Je Job wird entschieden, nicht pauschal:

| Bedingung | Ergebnis |
|---|---|
| `mode` gesetzt (Provider hat den Job erreicht) | nie erneut senden |
| Ursache `policy_rejected`, `media_rejected`, `quota`, `unknown`, `provider_unconfirmed` | nicht wiederholbar |
| `attempts >= 3` | Versuchslimit erreicht, nur manuell |
| Ursache `auth` ohne verwendbares Token | liegen lassen statt blind 401 |
| Ursache `auth`, `rate_limit`, `network` | erneut einplanen |

Abstaende: `auth` 60 s (nach Token-Erneuerung), `network` 2 min, `rate_limit`
15 min. Hoechstens 25 Jobs je Lauf. Bei `auth`-Jobs wird vorher ein echter
Token-Refresh versucht; das Ergebnis steht im Lauf-Protokoll.

## Endpunkte (Bearer `METRICS_TOKEN`)

```
GET  /api/x-token/status          Diagnose ohne Geheimnisse
POST /api/cron/x-token/refresh    erzwungener Refresh, ehrliches Ergebnis
POST /api/cron/publishing-retry   { "limit": 25, "dryRun": true }
```

## Tests

- `tests/x-token-dual-source.test.ts` (8): Kandidatenreihenfolge, Fallback auf
  Env bei totem DB-Token inklusive Persistenz, ehrlicher Fehler bei zwei toten
  Kandidaten, kein zweiter Versuch bei Serverfehler, kein abgelaufener Token als
  Ergebnis, Diagnose ohne Geheimnisse.
- `tests/publishing-retry-logic.test.ts` (11): Auswahlregeln, Versuchslimit,
  Provider-erreicht-Schutz, Lauf-Limit, Abstaende.
- Gesamtsuite: 3791 Tests gruen.

## Grenze

Eine echte X-Zustellung ist damit nicht nachgewiesen — nur, dass der Refresh
nicht mehr an einer toten Quelle haengt. Ob der Refresh-Token in `X_REFRESH_TOKEN`
selbst noch gueltig ist, sagt `GET /api/x-token/status` (Feld `lastRefreshError`)
bzw. `POST /api/cron/x-token/refresh`.

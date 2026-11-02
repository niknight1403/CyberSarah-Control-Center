# Autonomer Revenue-Loop

Ein geschlossener Regelkreis für Umsatz, Reichweite und B2B-Netzwerk. Der Loop
läuft täglich um 05:40 UTC über `.github/workflows/revenue-loop-autopilot.yml`
und ist zusätzlich manuell startbar.

## Der Kreis

| Schritt | Was passiert | Quelle im Code |
|---|---|---|
| Messen | Funnel- und Umsatzwerte (Landing, Signups, Checkout, MRR, Abos), B2B-Netzwerk, Reichweiten-Trichter | `server/revenue-autopilot.ts`, `server/growth-network-service.ts` |
| Priorisieren | größter Hebel nach Score, bei Gleichstand alphabetisch | `buildRevenueOpportunities` + `selectLever` |
| Handeln | Aktionen als **Entwurf**, je Bereich begrenzt; externe Ansprache immer freigabepflichtig | `buildActions` |
| Bewerten | MRR des letzten Laufs gegen heute, Bandbreite ±2 % | `evaluateLoopOutcome` |
| Lernen | Direktive gegen Endlosschleifen (weiter, Retry mit Backoff, Strategiewechsel, Eskalation, Abbruch) | `nextLoopDirective` |

## Ehrlichkeitsregeln

- **Keine erfundenen Zahlen.** Fehlt eine Baseline, steht `null` und der Loop
  meldet einen Blocker, statt eine Verbesserung zu schätzen.
- **Kein automatischer Versand.** Aktionen mit `requiresApproval: true`
  (B2B-Ansprache, Angebote) werden nur aufgelistet. Der Loop schreibt niemanden an.
- **Rauschband.** Änderungen unter ±2 % gelten als „nicht entschieden" (`iterate`),
  damit Zufall nicht als Erfolg verbucht wird.
- **Reichweite ohne Impressionen.** Impressionen werden nicht gemessen, also
  bleibt `impressions: null`; Raten werden nur aus Sichtungen/Anmeldungen gebildet.

## Endpunkte

Beide verlangen `Authorization: Bearer $METRICS_TOKEN`.

- `POST /api/cron/revenue-loop` — ein Durchlauf inklusive Persistenz.
  Antwort `200` = gespeichert, `207` = Lauf ohne Datenbank.
- `GET /api/revenue-loop/status` — Update ohne Seiteneffekte: aktueller Loop-Stand
  plus die letzten zehn Läufe (`mrrEur`, `deltaPct`, Urteil, Direktive).

Die Antwort enthält bewusst keine Kundennamen und keine Rohdaten, damit Logs
und Actions-Summaries teilbar bleiben.

## B2B-Netzwerk

Knoten kommen aus `b2b_network_nodes`, Stufen aus den stärksten Kanten in
`b2b_network_edges`:

| Kante | Stufe im Loop |
|---|---|
| `customer` | `active` |
| `partner` | `contract` |
| `engaged` | `meeting` |
| `qualified` | `replied` |
| `discovered` | `contacted` |
| `paused` | `churned` |

Ohne Kante gilt: `customer` → `active`, `partner` → `contract`, sonst
Beziehungsstärke ≥ 60 → `replied`, ≥ 30 → `contacted`, sonst `identified`.
Abgemeldete Kontakte (`opted_out`) werden weder geführt noch angesprochen.

Kontakte ohne Bewegung seit 14 Tagen gelten als festgefahren und erscheinen
zuerst, sortiert nach geschätztem Wert. Der Pipeline-Wert bleibt `null`, sobald
ein Kontakt keinen Wert hinterlegt hat — kein Teilwert als Gesamtwert.

## Persistenz

`revenue_loop_runs` (Migration `drizzle/0026_revenue_loop_runs.sql`) ist
append-only: je Lauf Hebel, Status, MRR vor/nach, Delta, Reichweiten- und
Netzwerk-Snapshot, Aktionen und Direktive. Kein Update, keine Löschung — die
Lernhistorie bleibt nachvollziehbar.

## Betrieb

```bash
# Update abrufen (nur lesend)
curl -s -H "Authorization: Bearer $METRICS_TOKEN" "$BASE_URL/api/revenue-loop/status" | jq '.digest.revenue, .digest.reach.note, .digest.network.note'

# Durchlauf auslösen
curl -s -X POST -H "Authorization: Bearer $METRICS_TOKEN" "$BASE_URL/api/cron/revenue-loop" | jq '.summary'
```

Was der Loop **nicht** tut: Anzeigen schalten, E-Mails senden, Preise ändern.
Diese Wirkung braucht eine Freigabe durch einen Menschen.

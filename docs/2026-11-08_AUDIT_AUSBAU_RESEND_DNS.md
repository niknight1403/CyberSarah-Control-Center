# 08.11.2026 — Audit-Ausbau: Resend, TikTok, Meta + Python-Worker

## Warum

Der Integrations-Audit (`npm run audit`) war gruen, waehrend der Mailversand
tot war. Grund: `lib/integration-registry-logic.ts` und der Audit prueften nur,
ob ein Schluessel **gesetzt** ist — nicht, ob er **funktioniert**. Ein gesetzter
Resend-Key sagt nichts darueber, ob die Absenderdomain verifiziert ist.

Ausserdem beobachtete `scripts/backend_health_check.py` nur einen lokalen
In-Process-Aufruf (`/api/health` ueber ASGITransport). Weder der laufende
FastAPI-Service (`cybersarah-backend`) noch der Celery-Worker wurden geprueft.

## Was jetzt geprueft wird

Neu: `lib/integration-live-probe-logic.ts` (rein, testbar) + Abschnitt 6 in
`scripts/integration-audit.ts`.

| Pruefung | Quelle | Severity bei Problem |
| --- | --- | --- |
| Resend-Absenderdomain | `GET api.resend.com/domains` | `fail` bei abgelehntem Key, fehlender oder unverifizierter Domain |
| Resend-DNS-Records | Resend-Domain-Details vs. echtes DNS (Cloudflare DoH) | `fail`, wenn geforderte Records live fehlen |
| DMARC | TXT `_dmarc.<domain>` via DoH | `warn` |
| TikTok Client-Credentials | `POST /v2/oauth/token/` (`client_credentials`) | `fail` bei `invalid_client` |
| TikTok Access-Token | `GET /v2/user/info/` | `fail` bei ungueltigem Token |
| Meta Access-Token | `GET graph.facebook.com/me` | `fail` bei Code 190/102 |
| Meta App-Credentials | `GET graph.facebook.com/{app-id}` | `fail` bei abgelehnten Credentials |

Severity-Politik: fehlende Schluessel erzeugen **skip** (kein falsches Rot),
erst live widerlegte Werte erzeugen **fail**. `--strict` macht zusaetzlich
Warnungen zu Fehlern, gedacht fuer Release-Gates (`npm run audit:strict`).

Neu im Python-Check: `--local` (Standard), `--live [URL]`, `--worker`, `--all`,
`--json`. Neue npm-Skripte: `backend:live`, `backend:worker`, `backend:health:all`.

## Befund vom 08.11.2026 (live geprueft)

**1. Resend: Domain `cybersarah-ki.com` steht auf `not_started`.** Keiner der
vier von Resend geforderten DNS-Records existiert. Jede Transaktionsmail laeuft
damit ins Leere. Die Records (Namen relativ zu `cybersarah-ki.com`, Provider
ist Hetzner `ns1.your-server.de`):

```
TXT    resend._domainkey   p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc7O1j3kRp8gskPAn7iUb0UcV1uJSCuUwuUGRNeuadHno5XtqFKy6+4UjqPyET2Wm4NA9aznpJ4s2PmoQPrdRGaq1kRHVg8NcXoMfrwyM20xrSimUuQM6WTCWo/nc+dvWoH76Ex7r2lewHUi2PC0Wy8XIwErOBeA8P1uS0Aw33ywIDAQAB
MX     send                feedback-smtp.eu-west-1.amazonses.com   (Prio 10)
TXT    send                v=spf1 include:amazonses.com ~all
CNAME  rsend               send.forge.rmta.net
```

Zusaetzlich fehlt eine DMARC-Richtlinie (`_dmarc.cybersarah-ki.com` liefert
NXDOMAIN). Empfehlung: `v=DMARC1; p=none; rua=mailto:<admin-postfach>`
als Einstieg, spaeter auf `quarantine`.

Nach dem Eintragen im DNS: Domain im Resend-Dashboard erneut pruefen
(“Verify DNS Records”), dann `npm run audit` — die beiden Resend-Pruefungen
muessen auf `PASS` springen.

**2. Python-Backend ist nicht deployt.** `https://cybersarah-backend.onrender.com`
antwortet mit HTTP 404 und `x-render-routing: no-server` — Render kennt unter
diesem Namen keinen Service, obwohl `render.yaml` ihn deklariert
(`cybersarah-backend`, Runtime python, `uvicorn main:app`). Konsequenz: die
Agenten-Ticks aus `modules/revenue-os/apps/api/app/celery_app.py` laufen
nirgends. Entweder Service anlegen oder die Deklaration entfernen; bis dahin
meldet `npm run backend:health:all` hier bewusst `FAIL`.

## Grenzen

- Lesend. Kein Mailversand, kein Posting, keine Budgetaenderung.
- Live-Pruefungen brauchen Netz. Ohne Schluessel: `skip` mit sichtbarem Grund.
- Der Python-Check laeuft (noch) nicht in CI: im Repo gibt es keine
  `requirements.txt` auf Root-Ebene, der Audit-Workflow installiert nur Node.
  Aufruf daher lokal bzw. auf dem Host: `npm run backend:health:all`.

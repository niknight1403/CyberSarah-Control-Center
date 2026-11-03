# Resend konfigurieren (03.11.2026)

Kurzanleitung plus der Befund, der die Einrichtung vorher unnoetig schwer
gemacht hat.

## Was der Code braucht

| Variable | Pflicht | Beispiel |
| --- | --- | --- |
| `RESEND_API_KEY` | ja | `re_…` aus resend.com/api-keys |
| `RESEND_FROM_EMAIL` **oder** `OUTREACH_FROM_ADDRESS` | ja | `team@cybersarah-ki.com` |

Gesendet wird ueber `dispatchTransactionalEmail` (`server/email-service.ts`):
Tageslimit 200 Mails, Idempotenz-Schluessel gegen Doppelversand, Betreff 5–120
Zeichen, Text 10–8000 Zeichen. Ohne Opt-in geht nichts raus.

## Der Stolperstein, der jetzt behoben ist

Der Einrichtungs-Assistent (`lib/account-agent-logic.ts`) und die
Revenue-Connectoren fragten die Absenderadresse als `OUTREACH_FROM_ADDRESS` ab,
der Versanddienst las aber nur `RESEND_FROM_EMAIL`. Wer sich an die Anleitung im
Assistenten hielt, sah danach trotzdem "Resend ist nicht konfiguriert".

Seit `resolveResendConfig` werden beide Namen gelesen: `RESEND_FROM_EMAIL` hat
Vorrang, ein Widerspruch zwischen beiden wird gemeldet statt still ignoriert.

## Einrichten

1. Resend-Konto: API-Key mit Recht `emails:send` anlegen (`re_…`).
2. Domain hinzufuegen und die DNS-Eintraege (SPF, DKIM) beim DNS-Anbieter
   setzen. Erst nach "verified" versendet Resend an fremde Empfaenger.
3. In Render (Service `cybersarah`): Environment → Secret `RESEND_API_KEY`
   eintragen, `RESEND_FROM_EMAIL` als normale Variable mit der Adresse auf der
   verifizierten Domain.
4. Deploy abwarten (Render startet bei Aenderung der Environment neu).
5. Pruefen: `npx tsx scripts/check-resend-config.ts team@cybersarah-ki.com`

Das Skript zeigt nur, ob Werte gesetzt sind (nie die Werte selbst), listet die
Domains im Konto mit Status und endet mit Exitcode 1, solange etwas fehlt.

## Grenzen

- Ohne verifizierte Domain nimmt Resend nur die eigene Kontoadresse als
  Empfaenger an — gut zum Testen, unbrauchbar fuer Kunden.
- `onboarding@resend.dev` ist ausdruecklich als Test-Absender markiert; das
  Skript warnt davor, weil Mails damit bei Kunden im Spam landen oder abgelehnt
  werden.
- Der Versand bleibt bei 200 Mails pro Tag. Fuer Kaltakquise ist das eine harte
  Grenze, kein Richtwert.

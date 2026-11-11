# Launch-Gate-Verifikation (11.11.2026)

**Bezug:** Issue #221 (Phase 7 Revenue Launch Gate)
**Anlass:** Nach vollstaendiger Befuellung der lokalen `.env` (133 Produktions-Keys, keine
Platzhalter) liess sich der Verkaufspfad erstmals mit echten Live-Schluesseln **lesend**
pruefen. Es wurde keine Live-Buchung, kein Checkout und kein Zahlungsvorgang ausgeloest.

**Umgebung:** lokal, `LIVE_MODE=false`, `SIMULATION_MODE=true`, alle vier Autopiloten `off`,
`STRIPE_MODE=live` passend zum `rk_live_`-Key.

## 1. Qualitaets-Gates

| Gate | Ergebnis |
|---|---|
| `tsc --noEmit` | gruen, keine Fehler |
| `vitest run` | 495 Dateien, **4204 Tests gruen** |
| `npm run build` (esbuild) | gruen, `dist/index.js` 1,8 MB |
| `/api/health` | `200 {"ok":true}` |
| `/api/ready` | `/api/ready` → `ok:true`, DB `true`, Schema `true` (44 Tabellen) |

## 2. Verkaufspfad (Abnahme-Checkliste, P0)

| Punkt | Stand | Beleg |
|---|---|---|
| Landingpage leitet **nicht** mehr zum Login | erledigt | `app/ai-influenza.tsx` nutzt `aiInfluenzaTeam.guestCheckout` (Gast-Checkout), `buildPackageLoginPath` nur noch fuer den angemeldeten Zweig |
| Paketkatalog oeffentlich abrufbar | erledigt | `aiInfluenzaTeam.catalog` liefert 4 Pakete: Starter 299 €, Growth 999 €, Business 2499 €, Elite 4999 € (monatlich, EUR) |
| Checkout ohne Sitzung blockiert | erledigt | `POST /api/billing/stripe/checkout` → `401 {"error":"Authentifizierung erforderlich."}`, kein Stripe-Objekt erzeugt |
| Paketpreis landet korrekt in der Session | erledigt | `buildAiInfluenzaStripeLineItem`: ohne `STRIPE_AI_INFLUENZA_PRICE_ID_*` wird `price_data` inline mit `monthlyPriceCents` gebaut (299/999/2499/4999 €) |
| Stripe Live-Konfiguration nur lesend geprueft | erledigt | Live-Key erreichbar (`REACHABLE (LIVE, RESTRICTED)`), 20 aktive Abo-Preise gelesen, keine Schreiboperation |
| Webhook-Endpunkt erreichbar und signaturpflichtig | erledigt | `https://hub.cybersarah-ki.com/ccc/api/billing/stripe/webhook` → unsignierter POST `400 {"error":"Webhook-Signatur ungueltig."}` (derselbe Handler wie `app.cybersarah-ki.com`) |
| Webhook-Events decken den Code ab | erledigt | aktiviert: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded` |
| Idempotenz | erledigt | Ledger `stripe_webhook_events`, `eventId` unique + `onConflictDoNothing`, zusaetzlich Schutz gegen Out-of-Order (`stale_out_of_order`) |
| KI-Route produktiv erreichbar | erledigt | `FREE_LLM_ROUTE: READY (GROQ)` (echter HTTP-200 gegen `api.groq.com/openai/v1/models`) |
| Digistore24-IPN | **offen, Betreiber** | `POST /api/v1/webhooks/digistore24` → `503 {"ok":false,"detail":"IPN-Secret nicht konfiguriert (DIGISTORE24_IPN_SECRET / DIGISTORE24_IPN_PASSPHRASE)."}` |

## 3. Was nur der Betreiber tun kann

1. **IPN-Passphrase** im Digistore24-Konto erzeugen und als Repo-Secret
   `DIGISTORE24_IPN_SECRET` hinterlegen, danach `Render Deploy` mit `target=app`.
   Bis dahin bleibt die IPN-Pruefung korrekt inaktiv (Wartepunkt, keine Systemblockade).
2. **DNS** fuer `api.cybersarah-ki.com` (CNAME in Render `unverified`).
3. **Erste echte Buchung** und APK-Geraetetest, Play-Store-Einreichung.

## 4. Befunde, die vor dem Bewerben eines Abos geklaert werden muessen

* **`STRIPE_PRICE_ID` ist nirgends gesetzt.** Der Abo-Pfad in `server/billing.ts`
  (`resolvePrice`) faellt daher auf `STRIPE_PRICE_LOOKUP_KEY=cybersarah-monthly` zurueck.
  Dieser Lookup zeigt live auf einen **Legacy-Preis ueber 19,90 €/Monat**, nicht auf einen
  der AI-Influenza-Paketpreise. Der AI-Influenza-Checkout ist davon **nicht** betroffen
  (er nutzt inline `price_data`), jeder andere Abo-Checkout wuerde aber 19,90 € abrechnen.
* Mehrere parallele Preiskataloge im Live-Konto (Nicknames 49/99/199 €, daneben
  299/999/2499/4999 €). Empfehlung: AI-Influenza-Pakete als feste Preise anlegen und ueber
  `STRIPE_AI_INFLUENZA_PRICE_ID_*` verdrahten, Altdaten deaktivieren.
* **Revenue-OS-Bruecke** (`REVENUE_BRIDGE: UNAVAILABLE_OR_UNPROTECTED`) und
  `REVENUE_OS_DATABASE_URL` sind aus dem Sandbox nicht pruefbar; das ist eine
  Netzwerkgrenze, kein belegter Defekt. Pruefung ueber den GitHub-Runner nachziehen.

## 5. Grenzen dieser Verifikation

Keine Live-Buchung, keine Zahlung, kein Versand. Der Resend-Domaincheck ist aus dem
Sandbox nicht abrufbar (`api.resend.com` blockiert); die Konfiguration ist vollstaendig,
die Zustellbarkeit bleibt ungeprueft. Umsatz-KPIs werden hier ausdruecklich **nicht**
ausgewiesen, weil kein echter Umsatz existiert.

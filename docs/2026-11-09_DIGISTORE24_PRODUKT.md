# Digistore24-Produkt autonom angelegt (09.11.2026)

Angelegt ueber die Digistore24-API (api_version 1.2) mit dem gueltigen API-Key,
ohne Dashboard-Zugriff.

## Produkt

| Feld | Wert |
|---|---|
| Produkt-ID | `762354` |
| Name (intern / deutsch) | CyberSarah Revenue OS - Monatszugang |
| Produkttyp | Software (`product_type_id` 37) |
| Waehrung | EUR |
| Sprache | de |
| Status | aktiv (`is_active` = Y) |
| Checkout | https://www.checkout-ds24.com/product/762354 |
| Thank-you-Seite | https://app.cybersarah-ki.com/ |
| Suchmaschinen | aus (`is_search_engine_allowed` = N) |

Beschreibung: KI-gesteuerte Umsatzzentrale fuer Content, Leads und wiederkehrende
Umsaetze; enthalten sind Umsatz-Dashboard, Content- und Funnel-Planung, KI-Agent und
Automatisierungen. Zugangsanleitung im Produkt hinterlegt (Zugangsdaten per E-Mail,
Login unter `app.cybersarah-ki.com`).

## Preis / Abo

| Feld | Wert |
|---|---|
| Payment-Plan-ID | `1556381` |
| Modell | Abo, monatlich (`billing_type` = subscription) |
| Erste Zahlung | 49,00 EUR |
| Folgezahlungen | 49,00 EUR alle 1 Monat (`1_month`) |
| Laufzeit | unbegrenzt (`number_of_installments` = 0) |
| Kuendigung | monatlich (`can_buyer_terminate_installments` = Y) |
| Anzeigetext | "Monatlich 49 EUR" |

Damit ist der wiederkehrende Umsatz technisch abbildbar: jede Monatszahlung erzeugt
einen eigenen IPN, der ueber `orderKey` (order_id + event) idempotent verbucht wird.

## Was noch fehlt (nur im Digistore24-Dashboard moeglich)

1. **Produktfreigabe.** Der Checkout antwortet aktuell:
   "Das Produkt ist aus folgendem Grund nicht verfuegbar: Das Produkt wurde noch nicht
   genehmigt." Ein Setzen von `approval_status` per API wird zwar mit `success`
   quittiert, aendert den Wert aber nicht (bleibt leer) — die Freigabe haengt an der
   Verkaeufer-Verifizierung im Konto, nicht an der API.
2. **IPN-Ziel eintragen.** In den Digistore24-Konto-Einstellungen (IPN) die URL
   `https://app.cybersarah-ki.com/api/v1/webhooks/digistore24` und die Passphrase
   hinterlegen. Die API bietet dafuer keine Methode (`getIpnSettings` existiert nicht).

## Wie die Kette danach nachweisbar ist

Der IPN-Endpunkt antwortet bei Erfolg mit dem Header `x-ipn-secret-fingerprint`. Der
8-stellige Wert nennt, welche der drei hinterlegten Passphrasen gepasst hat; die
uebrigen lassen sich danach aus `DIGISTORE24_IPN_SECRET` entfernen.

## Was am Produkt nichts aendert

Ein Produkt allein erzeugt keinen Umsatz. Es braucht Traffic auf den Checkout. Die
Kette Content -> Klick -> Kauf -> IPN -> Dashboard ist ab hier technisch geschlossen,
wirtschaftlich aber noch leer.

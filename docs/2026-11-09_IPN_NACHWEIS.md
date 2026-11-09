# IPN-Eingang nachweisen statt raten (09.11.2026)

## Warum

Ein echtes Testereignis von Digistore24 ist der einzige belastbare Beweis, dass
die IPN-Kette steht. Es laesst sich aber nicht von aussen ausloesen:

- Die Digistore24-API kennt **keine** Methode fuer einen Test-IPN. Geprueft und
  mit "Ungueltige API-Funktion aufgerufen" abgewiesen: `getIpnSettings`,
  `sendTestIpn`, `testIpn`, `createTestOrder`, `listOrders`.
- Die IPN-URL und die Passphrase werden **kontobezogen im Dashboard** gesetzt,
  nicht am Produkt. `getProduct` fuehrt kein IPN-Feld.
- Ein echter Testkauf braucht ein freigegebenes Produkt; die Freigabe ist per API
  nicht setzbar (Checkout meldet "noch nicht genehmigt").

Deshalb gibt es jetzt einen Nachweis-Endpunkt, der ein eintreffendes Ereignis in
Sekunden bestaetigt, statt es aus dem Dashboard zu erraten.

## Endpunkt

```
GET /api/digistore24/ipn-status      (Bearer METRICS_TOKEN)
```

Antwort: `secretsConfigured` (Anzahl hinterlegter Passphrasen-Kandidaten), die
letzten fuenf Ereignisse mit `orderKey`, `eventType`, Betrag, Provision, Waehrung,
`productSlug`, `occurredAt` und `receivedAt`, plus eine Einordnung, solange nichts
verbucht ist. Bewusst **ohne** Kaeuferdaten (kein E-Mail-Hash, kein Rohpayload).

## Ablauf fuer das echte Testereignis

1. Im Digistore24-Konto die IPN-URL setzen:
   `https://app.cybersarah-ki.com/api/v1/webhooks/digistore24`
2. Die IPN-Passphrase aus dem Konto als `DIGISTORE24_IPN_SECRET` in Render
   hinterlegen (mehrere Kandidaten kommagetrennt erlaubt).
3. Im Konto "IPN testen" ausloesen oder eine Testzahlung auf ein freigegebenes
   Produkt durchfuehren.
4. `GET /api/digistore24/ipn-status` zeigt das Ereignis. Der Antwortheader des
   Webhooks nennt zusaetzlich `x-ipn-secret-fingerprint`: die Passphrase, die
   Digistore24 tatsaechlich benutzt. Die uebrigen Kandidaten koennen danach weg.

## Stand

Der Webhook selbst ist produktionsbereit und wurde mit signierten Ereignissen
geprueft (Verkauf, Doppelzustellung, Erstattung). Was fehlt, ist allein der
Konto-Schritt 1 und 2 plus ein freigegebenes Produkt.

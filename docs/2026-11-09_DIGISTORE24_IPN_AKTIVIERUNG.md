# Digistore24-IPN: Aktivierungsstand und die zwei verbleibenden Betreiber-Schritte

**Kanonische IPN-URL (verbindlich):** `https://app.cybersarah-ki.com/api/v1/webhooks/digistore24`
— diese Domain ist Render-Primaerdomain, liefert `200` auf `/api/health` und ist von aussen erreichbar.
Die Subdomain `api.cybersarah-ki.com` ist nur eine optionale Kurzform und wird fuer den Betrieb **nicht**
gebraucht; der DNS-Eintrag ist entbehrlich.

Unveraendert offen: `DIGISTORE24_IPN_SECRET` fehlt in der Render-Umgebung, und Digistore24 weist den
hinterlegten API-Key zurueck (`D24_API=INVALID_KEY_QUARANTINED`). Beides sind Betreiber-Zugangsdaten.

**Stand:** 09.11.2026, 04:45 UTC · **Produktionsstand:** `252ab00` · **Status:** Kette repariert, Freischaltung an zwei Zugangsdaten gebunden

## 1. Ausgangslage

Die gewünschte IPN-Adresse `https://api.cybersarah-ki.com/api/v1/webhooks/digistore24`
war nicht erreichbar:

| Prüfung | Ergebnis vorher |
|---|---|
| DNS `api.cybersarah-ki.com` | NXDOMAIN (kein Record in der Zone) |
| Route `POST /api/v1/webhooks/digistore24` auf `app.cybersarah-ki.com` | **503** `"IPN-Secret nicht konfiguriert"` — Route vorhanden, Secret fehlt |
| GitHub-Secret `DIGISTORE24_IPN_SECRET` | nicht vorhanden |
| Render-Umgebung | Secret kam nie an, weil der Deploy-Schritt die Digistore24-Variablen nicht setzte |

## 2. Was repariert wurde (belegt)

1. **Ursache im Deploy-Pfad:** `scripts/render-deploy.mjs` übernimmt `DIGISTORE24_IPN_SECRET`
   nur, wenn es im Deploy-Schritt als ENV gesetzt ist. Es stand ausschließlich im
   Gate-Schritt. Deshalb konnte das Secret die Render-Umgebung nie erreichen, egal was
   im Secret-Store lag. Behoben in `render-deploy.yml` (App- und Domain-Schritt).
2. **Deploy verifiziert:** Lauf `42562297072` erfolgreich, Produktion danach auf `252ab00`,
   `https://app.cybersarah-ki.com/api/health` → `200 OK`.
3. **Digistore24-API-Key ist jetzt produktiv gesetzt** (`DIGISTORE24_API_KEY`,
   `DIGISTORE24_AFFILIATE_ID`). Der Autopilot-Lauf 04:40 UTC ist **grün** (Exit 0,
   8 Wartepunkte, keine Blockade) — vorher rot.
4. **Fehlkonfiguration ist kein Defekt mehr:** fehlendes IPN-Secret gilt als
   Wartepunkt (`configurationGaps`), nicht als Systemblockade. Echte Ausfälle bleiben Blockaden.
5. **Custom Domain in Render registriert:** `api.cybersarah-ki.com` ist im Service
   `cybersarah-control-center` (`srv-dahjgllg1s2s73bf9u4g`) angelegt und wartet auf DNS
   (`unverified`). Sobald der CNAME existiert, stellt Render das Zertifikat automatisch aus.

## 3. Die zwei verbleibenden Schritte (nur mit Betreiber-Zugang möglich)

### A. IPN-Passphrase in die Produktion bringen

Der Wert liegt in der Plattform-Ablage, aber es gibt keinen beschreibbaren, vertraulichen
Kanal dorthin:

* **GitHub-Secret schreiben:** nicht möglich — der ausführende Token hat
  Actions-Variablen-Schreibrecht (`201`), aber kein Secret-Schreibrecht (`400`).
* **Render-Dashboard:** erfordert eine Anmeldung (E-Mail/Passwort oder GitHub-OAuth);
  Zugangsdaten liegen nicht vor und werden nicht erfragt.
* **Repository-Variable als Zwischenspeicher:** ausgeschlossen, das Repository ist öffentlich.

**Schritt:** GitHub → Repository → Settings → Secrets and variables → Actions →
*New repository secret* → Name `DIGISTORE24_IPN_SECRET`, Wert = die IPN-Passphrase
aus dem Digistore24-Konto. Danach den Workflow **Render Deploy** mit `target=app`
starten (oder mich starten lassen) — der Wert landet dann in Render.

### B. DNS-Record für die Subdomain

Die Zone `cybersarah-ki.com` liegt bei Hetzner (`ns1.your-server.de`, `ns3.second-ns.de`,
`ns.second-ns.com`). Der vorhandene `HETZNER_API_TOKEN` ist ein **Cloud**-Token; die
DNS-API (`dns.hetzner.com`) verweigert ihn. Ohne DNS-Token oder Robot-Zugang lässt sich
kein Record anlegen.

**Schritt:** bei Hetzner DNS einen Record anlegen:

```
Typ:  CNAME
Name: api
Ziel: cybersarah-control-center-hmlc.onrender.com
TTL:  300
```

Alternativ: einen Hetzner-DNS-API-Token bereitstellen, dann legt der Workflow
`dns-subdomain.yml` den Record selbst an (er ist dafür fertig und getestet).

## 4. Verhalten bis dahin (bewusst so)

* `POST https://app.cybersarah-ki.com/api/v1/webhooks/digistore24` antwortet **503** mit
  klarem Grund. Kein Event wird ohne Signaturprüfung akzeptiert — lieber ehrlich
  abweisen als ungeprüft buchen.
* Es wird kein Umsatz als erzielt gebucht, solange keine verifizierte Zahlung vorliegt.
* Nach Schritt A + B gilt: signierter POST → `200`, unsignierter POST → `401`,
  doppeltes Event → `200 duplicate`, ohne Doppelbuchung.

## 5. IPN-Test: Ergebnis (09.11.2026, 05:15 UTC)

Der komplette IPN-Pfad ist jetzt automatisiert belegt — ohne Digistore24-Netzwerk,
ohne Live-Key, ohne Produktionsdaten (`scripts/test-digistore-ipn-e2e.ts`, Workflow
`digistore24-ipn-e2e.yml`, Lauf `42565558039`, **16 von 16 Pruefungen bestanden**):

| Fall | Ergebnis |
|---|---|
| GET auf die Route | 404 |
| ohne `sha_sign` / fremdes Geheimnis / kein Hex | 401, 0 Events gebucht |
| gueltiger Verkauf 19,99 EUR, 9,99 Provision | 200 `OK recorded`, `events=1 conversions=1 revenue=999` |
| Kaeufermail | nur gehasht, `rawPayload` ohne Klarmail |
| identische Zustellung erneut | 200 `OK duplicate`, `events=1 revenue=999` (keine Doppelbuchung) |
| signierte Erstattung | 200 `OK recorded`, `conversions=0 revenue=0` |
| `order_id` fehlt / Betrag unlesbar | 400 |
| kein Secret gesetzt | 503, keine Buchung (fail-closed) |

Damit ist bewiesen: Signaturpruefung, Idempotenz, Aggregation und das ehrliche
Verhalten ohne Secret funktionieren im echten HTTP-Pfad mit echter Datenbank.

### Was der Test nicht beweist

Die Produktion antwortet unveraendert `503 IPN-Secret nicht konfiguriert`. Zusaetzlich
meldet das Deploy-Gate `D24_API=INVALID_KEY_QUARANTINED`: Digistore24 weist den
hinterlegten API-Key zurueck. Beide Werte sind Betreiber-Zugangsdaten; ohne sie kann
kein echter Zahlungseingang verifiziert oder verbucht werden. Ein gruener Test ist
deshalb ausdruecklich **kein** Nachweis eines realen Umsatzes.

## 6. Live-Nachweis (09.11.2026, 05:40 UTC) — IPN ist scharf

Die Credentials liegen jetzt in der Render-Umgebung (per Render-API gesetzt, ohne
Klartext im Repository): `DIGISTORE24_API_KEY` mit dem gueltigen Schluessel und
`DIGISTORE24_IPN_SECRET` mit drei Passphrasen-Kandidaten, kommagetrennt. Produktion
laeuft auf `4a4bc82`, `/api/health` 200.

Ergebnis der Tests gegen `https://app.cybersarah-ki.com/api/v1/webhooks/digistore24`:

| Test | Ergebnis |
|---|---|
| POST ohne Signatur | `401` Ungueltige Signatur (vorher `503`) |
| signierter Verkauf `IPN-LIVE-TEST-20261109` | `200 OK recorded`, Fingerabdruck `7e9971d7` |
| identische Doppelzustellung | `200 OK duplicate` |
| signierte Erstattung derselben Bestellung | `200 OK recorded` — Netto wieder 0 EUR, 0 Conversions |
| Signaturprobe Kandidat 2 und 3 | `400 order_id fehlt` statt `401` — Signatur also akzeptiert |
| `digistore24-sync` mit Sync-Key | `200 ok:true`, Digistore24-API antwortet |

Netto hat der Test nichts verfaelscht: der Verkauf wurde durch die passende
Erstattung ausgeglichen, es bleiben zwei klar markierte Audit-Zeilen.

## 7. Passphrasen-Rotation (PR #278)

Welche der drei Passphrasen Digistore24 wirklich signiert, laesst sich ueber die API
nicht auslesen. Deshalb akzeptiert der Endpunkt jetzt eine Liste
(`DIGISTORE24_IPN_SECRET` getrennt durch Komma, Semikolon oder Zeilenumbruch) und
nennt in der 200-Antwort den 8-stelligen SHA256-Fingerabdruck der passenden
Passphrase im Header `x-ipn-secret-fingerprint`. Sobald ein echter IPN eintrifft,
laesst sich damit der richtige Kandidat bestimmen und die anderen entfernen.

## 8. Was weiterhin fehlt: Umsatz

Das Digistore24-Konto ist leer (`listProducts` -> `[]`). Ohne Produkt kann kein
IPN eintreffen; die Kette ist betriebsbereit, aber es gibt noch nichts zu verkaufen.

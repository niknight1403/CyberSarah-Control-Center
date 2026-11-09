# Digistore24-IPN: Aktivierungsstand und die zwei verbleibenden Betreiber-Schritte

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

# Secrets und Release-Workflow

## Wichtigste Sicherheitsentscheidung

Die hochgeladene Datei `projektschlüssel.json` ist ein Google-Cloud-Service-Account-Schlüssel und enthält einen privaten Schlüssel. Da dieser Schlüssel im Arbeitskontext offengelegt wurde, gilt er als kompromittiert. Er darf nicht weiterverwendet, nicht in GitHub gespeichert und nicht in eine `.env`-Datei kopiert werden. Der Schlüssel muss in der Google Cloud Console widerrufen und durch einen neuen Schlüssel ersetzt werden.

Der neue Schlüssel wird ausschließlich als lokale Datei unter `.secrets/google-play-service-account.json` abgelegt. Das Verzeichnis `.secrets/` ist im Repository ignoriert. Die EAS-Konfiguration referenziert diese Datei nur für Android-Submissions im internen Track mit dem Status `draft`.

## Empfohlene Reihenfolge

| Schritt | Aktion | Ergebnis |
| --- | --- | --- |
| 1 | Den kompromittierten Google-Service-Account-Schlüssel widerrufen. | Der offengelegte private Schlüssel ist nicht mehr gültig. |
| 2 | Einen neuen Schlüssel für den dedizierten Play-Upload-Service-Account erzeugen und die Berechtigungen auf das notwendige Play-Console-Ziel begrenzen. | Ein neuer, nicht offengelegter Upload-Schlüssel liegt lokal vor. |
| 3 | Den neuen Schlüssel mit `scripts/install-play-store-credentials.sh` importieren. | Die Datei wird strukturell geprüft, mit Modus `600` unter `.secrets/` installiert und nicht ausgegeben. |
| 4 | Einen Produktions-`.aab`-Build mit dem Profil `production` erstellen. | Ein für Google Play geeignetes Android App Bundle liegt vor. |
| 5 | Zuerst in den internen Track als Entwurf einreichen. | Es erfolgt kein unbeabsichtigter Produktions-Rollout. |
| 6 | Signierung, App-Berechtigungen, Datenschutzangaben und Release im Play Console-UI prüfen. | Erst danach kann eine Freigabe oder ein Rollout erfolgen. |

## Lokaler Import des neuen Keys

Nach der Rotation wird der neue Schlüssel nicht in das Repository kopiert, sondern nur lokal importiert:

```bash
cd /opt/cybersarah-control-center
chmod 600 /sicherer/pfad/google-play-service-account.json
./scripts/install-play-store-credentials.sh /sicherer/pfad/google-play-service-account.json
```

Das Skript schreibt die Datei nach `.secrets/google-play-service-account.json`. Es prüft nur die notwendige JSON-Struktur und gibt keine Credential-Werte aus.

## Laufzeit-Secrets der Anwendung

Die Secrets für Datenbank, JWT, Stripe, Metrics, OAuth und serverseitige Provider gehören in `/opt/cybersarah-control-center/.env`. Sie werden mit `scripts/setup-production-env.sh` interaktiv eingetragen. Das Skript erstellt eine Sicherung vorhandener `.env`-Dateien, verwendet Modus `600` und setzt den Eigentümer standardmäßig auf den systemd-Benutzer `cybersarah`. Es schreibt keine Werte in GitHub.

Nach dem Setup werden Build und Neustart kontrolliert ausgeführt:

```bash
sudo /opt/cybersarah-control-center/scripts/setup-production-env.sh
cd /opt/cybersarah-control-center
pnpm install --frozen-lockfile
pnpm run build
sudo systemctl restart cybersarah.service
sudo systemctl status cybersarah.service --no-pager
```

Ein Secret darf nicht gleichzeitig in der mobilen App, im Quellcode, in `eas.json` und in der Serverumgebung dupliziert werden. Provider-Schlüssel bleiben serverseitig oder werden im vorgesehenen SecureStore-Flow der App verwaltet. Der Play-Store-Service-Account ist ausschließlich ein Release-Credential und kein Laufzeit-Secret der Anwendung.

## GitHub und EAS

Die aktuelle GitHub-Integration kann Repository-Secrets in dieser Sitzung nicht auslesen; der API-Aufruf liefert `403 Resource not accessible by integration`. Das ist kein Beleg dafür, dass keine Secrets existieren. Falls später ein automatischer CI-Submit eingerichtet wird, muss `EXPO_TOKEN` als GitHub Actions Secret hinterlegt werden. Der Google-Service-Account-Key sollte bevorzugt in den EAS-Projekt-Credentials hochgeladen werden, statt als JSON-Datei in GitHub Actions zu landen.

Die lokale EAS-Konfiguration verwendet `serviceAccountKeyPath` für einen kontrollierten manuellen Submit. Der Release-Status ist absichtlich `draft`, damit ein Upload nicht direkt veröffentlicht wird:

```bash
pnpm dlx eas-cli@latest submit --platform android --profile production
```

Der erste Upload sollte erst erfolgen, wenn die App in der Google Play Console angelegt, der neue Service-Account dort berechtigt und der interne Track vorbereitet ist. EAS beschreibt für Android sowohl den Upload des Service-Account-Keys über Dashboard oder CLI als auch die `serviceAccountKeyPath`-Option in `eas.json`.[1] [2]

## Nicht tun

Die kompromittierte Datei `projektschlüssel.json` darf nicht importiert, an EAS hochgeladen, per Chat weitergegeben oder committed werden. Es darf kein privater Schlüssel in `.env.example`, `eas.json`, GitHub Actions, Logs oder Build-Artefakten erscheinen. Eine automatische Einreichung in einen öffentlichen oder produktiven Track wird nicht aktiviert, solange die Rotation und die manuelle Play-Console-Prüfung nicht abgeschlossen sind.

## Referenzen

[1]: https://docs.expo.dev/submit/android/ "Expo: Submit to the Google Play Store with EAS Submit"
[2]: https://docs.expo.dev/eas/json/ "Expo: eas.json configuration reference"

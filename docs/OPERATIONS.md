# CyberSarah Control Center — Betriebshandbuch

## Lokale Entwicklung

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Der Produktions-Bundle wird mit `pnpm build` erzeugt und mit `pnpm start` gestartet. Secrets gehören ausschließlich in eine lokale `.env` oder in die Secret-Verwaltung des jeweiligen Hosts.

## Render

Render verwendet `render.yaml`. Der Build lautet `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build`, der Start erfolgt mit `pnpm start`. `OAUTH_SERVER_URL` und `EXPO_PUBLIC_OAUTH_SERVER_URL` werden ausschließlich als geschützte Render-Environment-Variablen hinterlegt.

## Hetzner und systemd

Der Produktionsstand liegt unter `/opt/cybersarah-control-center`. Eine Service-Unit muss mit einem unprivilegierten, auf dem Host tatsächlich vorhandenen Benutzer betrieben werden. Status und Logs werden mit `systemctl status cybersarah.service --no-pager` und `journalctl -u cybersarah.service -f` geprüft.

## Speicherüberwachung

Das Skript `deploy/cybersarah-disk-check-ntfy.sh` prüft das Root-Dateisystem, verwendet konfigurierbare Warnschwellen und sendet nur bei Statuswechseln an ntfy. Die Topic-URL liegt in `/etc/cybersarah/disk-alert.env` mit Modus `0600`; sie wird weder in Git noch in Logs ausgegeben. Der zugehörige Timer sollte mit `systemctl list-timers cybersarah-disk-check-ntfy.timer --no-pager` geprüft werden.

## Backup und Wiederherstellung

Verschlüsselte Settings-Backups enthalten nur Provider-Konfigurationen und lokale Endpoints. Service- und GitHub-Tokens sowie Chat-Inhalte sind ausgeschlossen. Vor einem Restore wird die Authentizität geprüft und eine Vorschau angezeigt. Server-Archive werden vor Löschungen lokal übertragen und per SHA-256 gegen die Quelle verifiziert.

## Android-Publish-Handoff

Die Android-Konfiguration ist portrait-orientiert und verwendet das CyberSarah-Control-Center-Branding. Der APK-Build wird über die verwaltete Publish-Oberfläche gestartet. Nach dem Download ist ein Test auf einem echten Android-Gerät erforderlich; insbesondere Login, Workspace-Service, SecureStore, Medienauswahl, lokale Provider-Endpoints und Push-Berechtigungen sind zu prüfen.

## Sicherheitsregeln

Zugangsdaten, Topic-URLs, API-Keys, private SSH-Schlüssel und vollständige Tokens dürfen nicht in Git, Issues, CI-Ausgaben oder Chat-Nachrichten erscheinen. Bei versehentlich offengelegten Werten ist der betreffende Secret sofort zu widerrufen und neu zu erzeugen.

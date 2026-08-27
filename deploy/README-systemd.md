# CyberSarah Control Center als systemd-Service

Die Unit `cybersarah.service` startet den Produktionsserver aus `/opt/cybersarah` als Benutzer `ubuntu`. Die Anwendung lädt Variablen aus `/opt/cybersarah/.env`, verwendet Port `3000` und wird bei einem Fehler automatisch neu gestartet.

## Installation auf `CyberSarah-pro`

```bash
cd /opt/cybersarah
sudo install -o root -g root -m 0644 deploy/cybersarah.service /etc/systemd/system/cybersarah.service

# Produktionsumgebung vorbereiten
sudo test -f .env || sudo install -o ubuntu -g ubuntu -m 0600 /dev/null .env
sudo chown -R ubuntu:ubuntu /opt/cybersarah

# Falls die OAuth-Variable noch fehlt:
printf '\nOAUTH_SERVER_URL=https://api.manus.im\n' | sudo tee -a /opt/cybersarah/.env >/dev/null
sudo chown ubuntu:ubuntu /opt/cybersarah/.env
sudo chmod 600 /opt/cybersarah/.env

# Build sicherstellen
sudo -u ubuntu bash -lc 'cd /opt/cybersarah && pnpm install --frozen-lockfile && pnpm build'

# Unit laden, beim Boot aktivieren und sofort starten
sudo systemctl daemon-reload
sudo systemctl enable --now cybersarah.service
```

## Status und Logs

```bash
sudo systemctl status cybersarah.service --no-pager
sudo journalctl -u cybersarah.service -f
curl http://127.0.0.1:3000/api/health
```

## Betrieb

```bash
sudo systemctl restart cybersarah.service
sudo systemctl stop cybersarah.service
sudo systemctl disable cybersarah.service
```

Vor der Installation sollte geprüft werden, dass `pnpm` im Benutzerkontext von `ubuntu` verfügbar ist:

```bash
sudo -u ubuntu bash -lc 'command -v pnpm && pnpm --version'
```

Die Unit verwendet bewusst `User=ubuntu` und nicht `root`. Dadurch läuft der Node-Prozess mit reduzierten Rechten. Die Einstellung `EnvironmentFile=-/opt/cybersarah/.env` toleriert eine zunächst fehlende `.env`; für OAuth muss sie vor dem Start jedoch `OAUTH_SERVER_URL=https://api.manus.im` enthalten.

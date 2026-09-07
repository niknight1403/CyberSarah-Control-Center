# CyberSarah Control Center als systemd-Service

Die Unit `cybersarah.service` startet den Produktionsserver aus `/opt/cybersarah-control-center` als Benutzer und Gruppe `cybersarah`. Die Anwendung lädt Variablen aus `/opt/cybersarah-control-center/.env`, verwendet Port `3000` und wird bei einem Fehler automatisch neu gestartet.

## Installation auf `CyberSarah-pro`

```bash
cd /opt/cybersarah-control-center
sudo install -o root -g root -m 0644 deploy/cybersarah.service /etc/systemd/system/cybersarah.service

# Produktionsumgebung vorbereiten
sudo test -f .env || sudo install -o cybersarah -g cybersarah -m 0600 /dev/null .env
sudo chown -R cybersarah:cybersarah /opt/cybersarah-control-center

# Erforderliche Produktionsvariablen ausschließlich sicher in .env hinterlegen.
sudoedit /opt/cybersarah-control-center/.env
sudo chown cybersarah:cybersarah /opt/cybersarah-control-center/.env
sudo chmod 600 /opt/cybersarah-control-center/.env

# Build sicherstellen
sudo -u cybersarah bash -lc 'cd /opt/cybersarah-control-center && pnpm install --frozen-lockfile && pnpm build'

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

Vor der Installation sollte geprüft werden, dass `pnpm` im Benutzerkontext von `cybersarah` verfügbar ist:

```bash
sudo -u cybersarah bash -lc 'command -v pnpm && pnpm --version'
```

Die Unit verwendet bewusst `User=cybersarah` und nicht `root`. Dadurch läuft der Node-Prozess mit reduzierten Rechten. Das nichtoptionale `EnvironmentFile=/opt/cybersarah-control-center/.env` stellt sicher, dass ein Produktionsstart ohne explizite Konfiguration fehlschlägt, statt mit unvollständigen Zugangsdaten zu laufen.

# Uptime-Monitoring für `/api/health`

Das Skript `scripts/uptime-monitor.sh` prüft standardmäßig `http://127.0.0.1:3000/api/health`, also denselben Port wie der Produktionsservice. Es erwartet HTTP 200 und den JSON-Inhalt `"ok":true`. Erfolgreiche Prüfungen liefern Exitcode `0`; Verbindungs-, Timeout-, HTTP- oder Inhaltsfehler liefern Exitcode `1` und werden mit Zeitstempel, HTTP-Status, Curl-Exitcode und Latenz protokolliert.

## Installation auf CyberSarah-pro

```bash
cd /opt/cybersarah-control-center
sudo install -m 0755 scripts/uptime-monitor.sh /usr/local/bin/cybersarah-health
sudo install -m 0644 deploy/cybersarah-health.service /etc/systemd/system/cybersarah-health.service
sudo install -m 0644 deploy/cybersarah-health.timer /etc/systemd/system/cybersarah-health.timer
sudo systemctl daemon-reload
sudo systemctl enable --now cybersarah-health.timer
```

## Status und manueller Test

```bash
systemctl status cybersarah-health.timer --no-pager
systemctl start cybersarah-health.service
systemctl status cybersarah-health.service --no-pager
sudo tail -50 /var/log/cybersarah-health.log
```

Das Log sollte Zeilen wie `status=UP http=200` enthalten. Bei einem Fehler erscheinen `status=DOWN`, der HTTP-Status beziehungsweise `000` bei einem Verbindungsfehler sowie der Curl-Exitcode.

## Optionaler direkter Check

```bash
HEALTH_URL=http://127.0.0.1:3000/api/health \
LOG_FILE=/var/log/cybersarah-health.log \
/usr/local/bin/cybersarah-health
```

Für eine Prüfung über den Reverse Proxy kann `HEALTH_URL` im Service auf die öffentliche oder lokale Proxy-Adresse gesetzt werden. Für die isolierte Backend-Prüfung ist `127.0.0.1:3000` die eindeutige Zieladresse.

# Speicherwarnungen mit ntfy.sh

Das Skript `cybersarah-disk-check-ntfy.sh` prüft das Root-Dateisystem und sendet nur bei einem Zustandswechsel eine ntfy-Benachrichtigung. Standardmäßig gilt: Warnung ab 85 Prozent Belegung, kritisch ab 90 Prozent. Die Werte können über die Environment-Datei angepasst werden.

## Sichere Konfiguration auf dem Server

Als `root` auf `CyberSarah-pro`:

```bash
install -d -m 0700 /etc/cybersarah
read -rsp 'ntfy-Topic-URL: ' NTFY_URL
printf '\n'
printf 'NTFY_URL=%q\n' "$NTFY_URL" > /etc/cybersarah/disk-alert.env
unset NTFY_URL
chmod 0600 /etc/cybersarah/disk-alert.env
```

Ein ntfy-Topic sollte lang und schwer zu erraten sein, weil ein öffentliches Topic ohne Authentifizierung wie ein Geheimnis behandelt wird. Alternativ kann `NTFY_TOKEN` in derselben Datei gesetzt werden:

```text
NTFY_URL=https://ntfy.sh/dein-langes-topic
NTFY_TOKEN=tk_dein_token
WARN_PERCENT=85
CRITICAL_PERCENT=90
```

## Installation

```bash
install -o root -g root -m 0755 deploy/cybersarah-disk-check-ntfy.sh /usr/local/sbin/cybersarah-disk-check-ntfy
```

Service:

```bash
cat > /etc/systemd/system/cybersarah-disk-check-ntfy.service <<'EOF'
[Unit]
Description=CyberSarah Speicherwarnung über ntfy.sh

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/cybersarah-disk-check-ntfy
EOF
```

Timer:

```bash
cat > /etc/systemd/system/cybersarah-disk-check-ntfy.timer <<'EOF'
[Unit]
Description=CyberSarah Speicherprüfung alle 15 Minuten

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

Aktivierung und Test:

```bash
systemctl daemon-reload
systemctl enable --now cybersarah-disk-check-ntfy.timer
systemctl start cybersarah-disk-check-ntfy.service
systemctl status cybersarah-disk-check-ntfy.timer --no-pager
journalctl -u cybersarah-disk-check-ntfy.service -n 30 --no-pager
```

Die Datei `/etc/cybersarah/disk-alert.env` darf nicht in Git eingecheckt werden. Das Skript sendet bei unverändertem Status keine wiederholten Nachrichten; bei Rückkehr von `warning` oder `critical` zu `ok` wird eine Entwarnung versendet.

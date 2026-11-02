#!/usr/bin/env bash
# Read-only: Wo liegen die Villa-Projektordner, und ist nach dem Deploy alles da?
set -uo pipefail

echo "== Dienst-Umgebung =="
sudo -n systemctl show villaforge -p Environment 2>/dev/null | tr ' ' '\n' | grep -i "VF_\|WORKSPACE" | head -10
sudo -n grep -i "Environment\|WorkingDirectory\|ExecStart" /etc/systemd/system/villaforge.service 2>/dev/null | head -10

echo "== Verzeichnisse unter /opt/villaforge =="
sudo -n ls -la /opt/villaforge | head -15

echo "== server/data vorhanden? =="
sudo -n ls -la /opt/villaforge/server/data 2>/dev/null | head -10 || echo "server/data fehlt"

echo "== Kandidaten für Workspaces =="
for d in /opt/villaforge/data/workspace /opt/villaforge/server/data/workspace /opt/villaforge/workspace; do
  if sudo -n test -d "$d"; then
    echo "vorhanden: $d"
    sudo -n ls "$d" 2>/dev/null | head -20
  fi
done

echo "== villa-34 irgendwo? =="
sudo -n find /opt/villaforge -maxdepth 6 -type d -name "villa-34*" 2>/dev/null | head -5
sudo -n find /opt /root /home -maxdepth 5 -type d -name "villa-34*" 2>/dev/null | head -5

echo "== Projektdateien Villa 34 =="
for p in /opt/villaforge/data/workspace/villa-34/project /opt/villaforge/server/data/workspace/villa-34/project; do
  if sudo -n test -d "$p"; then
    echo "Projekt: $p"
    sudo -n find "$p" -maxdepth 2 -not -path "*/node_modules*" -type f 2>/dev/null | head -20
    echo "-- package.json --"
    sudo -n cat "$p/package.json" 2>/dev/null | head -30
    echo "-- node_modules? --"
    sudo -n test -d "$p/node_modules" && echo "ja" || echo "nein"
  fi
done

echo "== Sicherungen =="
sudo -n ls -lh /opt/vf-code-backup-*.tgz /opt/vf-db-backup-*.db 2>/dev/null | awk '{print "  "$9" "$5}'

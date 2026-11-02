#!/usr/bin/env bash
# Read-only: Welche Datenbank nutzt der laufende Hub wirklich?
set -uo pipefail

PID=$(pgrep -f "server/server[.]mjs" | head -1)
echo "Hub-PID: ${PID:-keine}"
if [ -n "${PID:-}" ]; then
  echo "== geoeffnete Dateien (.db) =="
  sudo -n ls -l /proc/$PID/fd 2>/dev/null | grep -i "\.db" | head -10
  echo "== Umgebung des Prozesses =="
  sudo -n tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep -iE "VF_|DB|WORKSPACE" | grep -vi token | head -10
  echo "== Arbeitsverzeichnis =="
  sudo -n readlink /proc/$PID/cwd
fi

echo "== alle SQLite-Dateien unter /opt =="
sudo -n find /opt -maxdepth 4 -name "*.db" -o -maxdepth 4 -name "*.sqlite*" 2>/dev/null | head -20 | while read -r f; do
  N=$(sudo -n node --experimental-sqlite -e "
    const { DatabaseSync } = require('node:sqlite');
    try { const db = new DatabaseSync('$f', { readOnly: true });
      const c = db.prepare(\"SELECT COUNT(*) c FROM sqlite_master WHERE name='villas'\").get();
      if (!c || !c.c) { process.stdout.write('keine villas-Tabelle'); }
      else { const n = db.prepare('SELECT COUNT(*) c FROM villas').get();
             const maxId = db.prepare('SELECT MAX(id) m FROM villas').get();
             process.stdout.write(n.c + ' Villen, max id ' + (maxId.m||0)); }
    } catch (e) { process.stdout.write('nicht lesbar: ' + String(e.message).split('\n')[0]); }
  " 2>/dev/null)
  echo "  $(sudo -n ls -lh "$f" | awk '{print $5, $6, $7, $8}')  $f  -> $N"
done

echo "== Workspace-Inhalt =="
sudo -n ls -la /opt/villaforge/workspace | head -20
echo "== weitere Workspace-Kandidaten =="
sudo -n find /opt /root /home -maxdepth 4 -type d -name "villa-34*" 2>/dev/null | head -5

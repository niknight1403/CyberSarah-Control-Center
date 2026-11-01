#!/usr/bin/env bash
# Platz-Audit mit sicherem Aufraeumen. Loescht nur Caches und rotierte Logs.
set -uo pipefail

echo "== Belegung =="
df -h / | tail -1
echo "== Grosse Verzeichnisse =="
du -sh /root /srv /var/lib /var/log /opt /usr /home 2>/dev/null | sort -h
echo "== /root im Detail =="
du -xh -d1 /root 2>/dev/null | sort -h | tail -6
echo "== /opt =="
du -xh -d1 /opt 2>/dev/null | sort -h | tail -6
echo "== Docker =="
docker system df 2>/dev/null
echo "== PM2 Arbeitsverzeichnisse =="
pm2 jlist 2>/dev/null | grep -o '"pm_cwd":"[^"]*"' | sort -u
echo "== Laufende Container =="
docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | head -8

echo "== Aufraeumen (nur Caches und rotierte Logs) =="
BEFORE=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
find /var/log -maxdepth 1 -type f \( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \) -delete 2>/dev/null && echo "rotierte Logs entfernt"
journalctl --vacuum-size=50M 2>&1 | tail -1
find /root/.cache -mindepth 1 -delete 2>/dev/null && echo "Cache geleert"
find /root/.npm/_cacache -mindepth 1 -delete 2>/dev/null && echo "npm-Cache geleert"
find /tmp -maxdepth 1 -mindepth 1 -mtime +1 -delete 2>/dev/null && echo "/tmp aufgeraeumt"
docker volume prune -f 2>&1 | tail -1
AFTER=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
echo "Platz: ${BEFORE} GB -> ${AFTER} GB frei"
df -h / | tail -1
echo "== Speicher =="
free -m | head -3

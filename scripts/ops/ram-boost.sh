#!/usr/bin/env bash
# Holt RAM und Platte zurueck und erweitert Swap. Stoppt nur ephemere
# OpenHands-Sandbox-Container, niemals die App oder den OpenHands-Dienst.
set -uo pipefail
cd /opt/cybersarah-control-center || exit 1

echo "== RAM vorher =="
free -m | head -3
echo "== Groesste Prozesse =="
ps -eo rss,comm --sort=-rss 2>/dev/null | head -10
echo "== Container-Speicher =="
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' 2>/dev/null | head -8

echo "== Ephemere Sandbox-Container stoppen =="
STOPPED=0
for name in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^openhands-runtime-'); do
  if docker stop "$name" > /dev/null 2>&1; then
    echo "gestoppt: $name"
    STOPPED=$((STOPPED + 1))
  fi
done
echo "Gestoppt: $STOPPED (Dienst openhands-autonomous-app und deploy-villa bleiben unberuehrt)"
docker container prune -f 2>&1 | tail -1

echo "== Platz freigeben =="
docker image prune -af 2>&1 | tail -2
df -h / | tail -1

echo "== Swap auf 8 GB erweitern =="
AVAIL=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
echo "Frei: ${AVAIL} GB"
CURRENT_SWAP=$(free -m | awk '/Swap:/{print $2}')
echo "Swap aktuell: ${CURRENT_SWAP} MB"
SWAPFILE=/swapfile2
if swapon --show 2>/dev/null | grep -q "$SWAPFILE"; then
  echo "$SWAPFILE bereits aktiv"
elif [ "${AVAIL:-0}" -ge 7 ]; then
  fallocate -l 6G "$SWAPFILE" 2>/dev/null || dd if=/dev/zero of="$SWAPFILE" bs=1M count=6144 status=none 2>/dev/null
  if chmod 600 "$SWAPFILE" && mkswap "$SWAPFILE" > /dev/null 2>&1 && swapon "$SWAPFILE" 2>/dev/null; then
    grep -q "^$SWAPFILE" /etc/fstab 2>/dev/null || echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
    echo "6 GB Swap angelegt und aktiv"
  else
    echo "FEHLER: Swap konnte nicht aktiviert werden"
  fi
else
  echo "Nicht genug Platte fuer 6 GB Swap (${AVAIL} GB frei)"
fi
sysctl -w vm.swappiness=20 > /dev/null 2>&1
sysctl -w vm.vfs_cache_pressure=50 > /dev/null 2>&1

echo "== RAM nachher =="
free -m | head -3
swapon --show 2>/dev/null
echo "== App-Status =="
curl -s -o /tmp/h.json -w "ready: %{http_code}\n" --max-time 10 http://localhost:3000/api/ready
head -c 200 /tmp/h.json 2>/dev/null; echo

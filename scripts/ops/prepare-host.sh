#!/usr/bin/env bash
# Host vorbereiten: Zustand pruefen, Swap aktivieren, Platz freigeben.
set -uo pipefail
cd /opt/cybersarah-control-center || exit 1

echo "== Health =="
code=$(curl -s -o /tmp/h.json -w '%{http_code}' --max-time 10 http://localhost:3000/api/ready || echo 000)
echo "ready: $code"
head -c 300 /tmp/h.json 2>/dev/null; echo

echo "== node_modules (nach abgebrochenem npm ci) =="
if node -e "require.resolve('express')" 2>/dev/null; then echo "express aufloesbar"; else echo "express FEHLT"; fi
echo "Pakete im Verzeichnis: $(ls node_modules 2>/dev/null | wc -l)"

echo "== Speicher =="
free -m | head -2
if [ -f /swapfile ]; then
  if swapon --show 2>/dev/null | grep -q /swapfile; then
    echo "Swap: aktiv"
  else
    mkswap /swapfile > /dev/null 2>&1 || true
    if swapon /swapfile 2>&1; then echo "Swap: jetzt aktiv"; else echo "Swap: liess sich nicht aktivieren"; fi
  fi
else
  echo "Swap: keine Datei vorhanden"
fi
free -m | head -2

echo "== Platz vorher =="
df -h / | tail -1
echo "== Ungenutzte Docker-Images aelter 14 Tage =="
docker image prune -af --filter "until=336h" 2>&1 | tail -2
docker container prune -f 2>&1 | tail -1
echo "== Platz nachher =="
df -h / | tail -1

echo "== Ports 80/443/3000 =="
ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:3000 ' || echo "80 und 443 frei"

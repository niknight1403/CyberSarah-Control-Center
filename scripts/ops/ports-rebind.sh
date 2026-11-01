#!/usr/bin/env bash
# Bindet die oeffentlich veroeffentlichten Container-Ports an localhost.
#   Villa  : 3000 -> 127.0.0.1:3002 (3000 gehoert der CyberSarah-App)
#   OpenHands: 3001 -> 127.0.0.1:3001
set -uo pipefail

VILLA_FILE=/root/Agenten-Villa/deploy/docker-compose.hetzner.yml
OH_FILE=/opt/openhands/docker-compose.yml

show_ports() {
  echo "--- ports-Abschnitt in $1 ---"
  grep -n -A 6 "ports:" "$1" 2>/dev/null | head -12
}

patch() { # file such neu
  local file="$1" old="$2" new="$3"
  [ -f "$file" ] || { echo "FEHLER: $file fehlt"; return 1; }
  if grep -qF "$new" "$file"; then
    echo "  bereits gesetzt: $new"
    return 0
  fi
  cp "$file" "${file}.bak-portlock"
  sed -i "s|\"${old}\"|\"${new}\"|g; s|'${old}'|'${new}'|g; s|- ${old}|- ${new}|g" "$file"
  if grep -qF "$new" "$file"; then
    echo "  umgestellt: $old -> $new"
    return 0
  fi
  echo "  FEHLER: Muster $old nicht gefunden"
  return 1
}

echo "== Vorher =="
show_ports "$VILLA_FILE"
show_ports "$OH_FILE"

echo "== Compose-Dateien anpassen =="
patch "$VILLA_FILE" "3000:3000" "127.0.0.1:3002:3000"
VILLA_OK=$?
patch "$OH_FILE" "3001:3000" "127.0.0.1:3001:3000"
OH_OK=$?

echo "== Nachher =="
show_ports "$VILLA_FILE"
show_ports "$OH_FILE"

if [ "$VILLA_OK" -ne 0 ] || [ "$OH_OK" -ne 0 ]; then
  echo "FEHLER: nicht beide Dateien angepasst, Container bleiben unveraendert"
  exit 1
fi

echo "== Container neu erstellen =="
docker compose -p deploy -f "$VILLA_FILE" up -d 2>&1 | tail -4
docker compose -p openhands -f "$OH_FILE" up -d 2>&1 | tail -4

echo "== Docker-Ports jetzt =="
docker ps --format '{{.Names}} | {{.Ports}}'

echo "== Listener =="
ss -tlnp 2>/dev/null | grep -E ':(3000|3001|3002) ' || echo "keine"

echo "== Lokale Tests =="
curl -s -o /dev/null -w "  App via Caddy-Port 3000: %{http_code}\n" --max-time 8 http://127.0.0.1:3000/api/ready
curl -s -o /dev/null -w "  OpenHands 3001: %{http_code}\n" --max-time 8 http://127.0.0.1:3001/
curl -s -o /dev/null -w "  Villa 3002: %{http_code}\n" --max-time 10 http://127.0.0.1:3002/

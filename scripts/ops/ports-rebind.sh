#!/usr/bin/env bash
# Bindet die oeffentlich veroeffentlichten Container-Ports an localhost.
#   Villa     : "3000:3000"                       -> "127.0.0.1:3002:3000"
#   OpenHands : "${OPENHANDS_PORT:-3000}:3000"    -> "127.0.0.1:${OPENHANDS_PORT:-3001}:3000"
# Port 3000 gehoert der CyberSarah-App selbst.
set -uo pipefail

VILLA_FILE=/root/Agenten-Villa/deploy/docker-compose.hetzner.yml
OH_FILE=/opt/openhands/docker-compose.yml

show_ports() {
  echo "--- $1 ---"
  grep -n -A 3 "ports:" "$1" 2>/dev/null | head -6
}

echo "== Vorher =="
show_ports "$VILLA_FILE"
show_ports "$OH_FILE"

VILLA_OK=1
OH_OK=1

# Villa
if grep -qF "127.0.0.1:3002:3000" "$VILLA_FILE" 2>/dev/null; then
  echo "Villa: bereits auf 127.0.0.1:3002"; VILLA_OK=0
elif grep -qF "3000:3000" "$VILLA_FILE" 2>/dev/null; then
  cp "$VILLA_FILE" "${VILLA_FILE}.bak-portlock"
  sed -i 's|"3000:3000"|"127.0.0.1:3002:3000"|g; s|- 3000:3000|- 127.0.0.1:3002:3000|g' "$VILLA_FILE"
  grep -qF "127.0.0.1:3002:3000" "$VILLA_FILE" && { echo "Villa: umgestellt auf 127.0.0.1:3002"; VILLA_OK=0; }
fi

# OpenHands
if grep -qF '127.0.0.1:${OPENHANDS_PORT' "$OH_FILE" 2>/dev/null; then
  echo "OpenHands: bereits auf localhost"; OH_OK=0
elif grep -qF '"${OPENHANDS_PORT:-3000}:3000"' "$OH_FILE" 2>/dev/null; then
  cp "$OH_FILE" "${OH_FILE}.bak-portlock"
  sed -i 's|- "${OPENHANDS_PORT:-3000}:3000"|- "127.0.0.1:${OPENHANDS_PORT:-3001}:3000"|g' "$OH_FILE"
  grep -qF '127.0.0.1:${OPENHANDS_PORT' "$OH_FILE" && { echo "OpenHands: umgestellt auf 127.0.0.1"; OH_OK=0; }
fi

echo "== Nachher =="
show_ports "$VILLA_FILE"
show_ports "$OH_FILE"

if [ "$VILLA_OK" -ne 0 ] || [ "$OH_OK" -ne 0 ]; then
  echo "FEHLER: mindestens eine Datei nicht angepasst, Container bleiben unveraendert"
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
curl -s -o /dev/null -w "  App (3000): %{http_code}\n" --max-time 8 http://127.0.0.1:3000/api/ready
curl -s -o /dev/null -w "  OpenHands (3001): %{http_code}\n" --max-time 8 http://127.0.0.1:3001/
curl -s -o /dev/null -w "  Villa (3002): %{http_code}\n" --max-time 12 http://127.0.0.1:3002/

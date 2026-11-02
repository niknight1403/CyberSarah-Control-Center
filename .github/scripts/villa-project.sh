#!/usr/bin/env bash
# Read-only: Projektordner einer Villa auf der VM untersuchen.
set -uo pipefail
VID="${1:-34}"

echo "== Kandidaten =="
sudo -n find /opt/villaforge -maxdepth 4 -type d \( -name "projects" -o -name "villa-*" -o -name "*${VID}*" \) 2>/dev/null | head -10

DIR=""
for c in "/opt/villaforge/data/projects/$VID" "/opt/villaforge/projects/$VID" "/opt/villaforge/data/villas/$VID/project" "/opt/villaforge/data/workspace/$VID"; do
  [ -d "$c" ] && DIR="$c" && break
done
if [ -z "$DIR" ]; then
  DIR=$(sudo -n find /opt/villaforge -maxdepth 5 -type d -name "project" -path "*${VID}*" 2>/dev/null | head -1)
fi
echo "== Projektordner: ${DIR:-(nicht gefunden)} =="
[ -n "$DIR" ] || exit 0

echo "== Inhalt =="
sudo -n ls -la "$DIR" 2>/dev/null | head -20
echo "== Dateien (ohne node_modules) =="
sudo -n find "$DIR" -maxdepth 2 -not -path "*/node_modules*" -type f 2>/dev/null | head -25
echo "== package.json =="
sudo -n cat "$DIR/package.json" 2>/dev/null | head -40
echo "== node_modules/jest =="
if sudo -n test -d "$DIR/node_modules/jest"; then echo "vorhanden"; else echo "fehlt"; fi
if sudo -n test -x "$DIR/node_modules/.bin/jest"; then echo "Binary vorhanden"; else echo "Binary fehlt"; fi
echo "== npm test (roh, 60s) =="
sudo -n timeout 60 npm test --prefix "$DIR" 2>&1 | tail -12
echo "== Python-Dateien =="
sudo -n find "$DIR" -name "*.py" -not -path "*/node_modules*" 2>/dev/null | head -10

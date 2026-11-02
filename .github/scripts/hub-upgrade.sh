#!/usr/bin/env bash
# VillaForge-Hub auf den Stand von Agentforge2 main bringen - mit Sicherung und Rueckweg.
# Laeuft auf der VM: ssh ... 'bash -s' < .github/scripts/hub-upgrade.sh
set -uo pipefail

TS=$(date +%Y%m%d-%H%M%S)
SRC_TGZ=/tmp/agentforge2-main.tar.gz
SRC_DIR=/tmp/agentforge2-src
BK_CODE=/opt/vf-code-backup-$TS.tgz
BK_DB=/opt/vf-db-backup-$TS.db
HEALTH=/tmp/vf-health.json

fail() { echo "FEHLER: $*"; exit 1; }

echo "== Voraussetzungen =="
sudo -n true 2>/dev/null || fail "kein sudo ohne Passwort"
command -v rsync >/dev/null || fail "rsync fehlt"
command -v npm >/dev/null || fail "npm fehlt"
command -v curl >/dev/null || fail "curl fehlt"
USED=$(df -P /opt | awk 'NR==2{gsub("%","",$5); print $5}')
echo "Platte /opt belegt: ${USED} %"
[ "$USED" -lt 90 ] || fail "Platte zu voll (${USED} %)"
echo "node $(node -v), npm $(npm -v)"

echo "== Quelle laden =="
curl -fsSL https://codeload.github.com/niknight1403/Agentforge2/tar.gz/refs/heads/main -o "$SRC_TGZ" || fail "Download fehlgeschlagen"
rm -rf "$SRC_DIR"; mkdir -p "$SRC_DIR"
tar xzf "$SRC_TGZ" -C "$SRC_DIR" --strip-components=1 || fail "Entpacken fehlgeschlagen"
[ -f "$SRC_DIR/server/server.mjs" ] || fail "Quelle unvollstaendig (server/server.mjs fehlt)"
[ -f "$SRC_DIR/server/project-focus.mjs" ] || echo "Hinweis: project-focus.mjs nicht in der Quelle"
echo "Server-Module in der Quelle: $(ls "$SRC_DIR"/server/*.mjs | wc -l)"

echo "== Sicherung =="
sudo tar czf "$BK_CODE" -C /opt/villaforge server app package.json package-lock.json 2>/dev/null || echo "Warnung: Code-Sicherung unvollstaendig"
sudo cp /opt/villaforge/data/hub.db "$BK_DB" 2>/dev/null || echo "Warnung: keine DB-Kopie"
ls -lh "$BK_CODE" 2>/dev/null | awk '{print "  Code-Sicherung: "$5}'
ls -lh "$BK_DB" 2>/dev/null | awk '{print "  DB-Kopie:       "$5}'

echo "== Einspielen =="
sudo rsync -a --delete "$SRC_DIR/server/" /opt/villaforge/server/ || fail "rsync server"
if [ -d "$SRC_DIR/app" ]; then sudo rsync -a "$SRC_DIR/app/" /opt/villaforge/app/ || echo "Warnung: app/ unvollstaendig"; fi
if [ -d "$SRC_DIR/docs" ]; then sudo rsync -a "$SRC_DIR/docs/" /opt/villaforge/docs/ || echo "Warnung: docs/ unvollstaendig"; fi
sudo cp "$SRC_DIR/package.json" /opt/villaforge/package.json || fail "package.json"
if [ -f "$SRC_DIR/package-lock.json" ]; then sudo cp "$SRC_DIR/package-lock.json" /opt/villaforge/package-lock.json; fi
echo "Module im Ziel: $(sudo ls /opt/villaforge/server/*.mjs | wc -l)"

echo "== Abhaengigkeiten =="
cd /opt/villaforge || fail "cd /opt/villaforge"
sudo -n npm install --omit=dev --no-audit --no-fund 2>&1 | tail -4

echo "== Neustart =="
sudo -n systemctl restart villaforge || fail "systemctl restart"
CODE=000
for _ in $(seq 1 20); do
  CODE=$(curl -s -o "$HEALTH" -w '%{http_code}' -m 5 http://127.0.0.1:12000/api/health)
  [ "$CODE" = "200" ] && break
  sleep 4
done
echo "Health lokal: $CODE"

if [ "$CODE" != "200" ]; then
  echo "== Rueckweg =="
  sudo -n systemctl stop villaforge
  sudo tar xzf "$BK_CODE" -C /opt/villaforge 2>/dev/null || echo "Warnung: Code-Rueckweg unvollstaendig"
  [ -f "$BK_DB" ] && sudo cp "$BK_DB" /opt/villaforge/data/hub.db
  sudo -n systemctl start villaforge
  sleep 10
  echo "Health nach Rueckweg: $(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:12000/api/health)"
  fail "Neustand nicht gesund, alter Stand wiederhergestellt"
fi

echo "== Pruefung =="
head -c 220 "$HEALTH"; echo
echo "Fokus-Endpunkt: $(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:12000/api/focus)"
echo "Status der Villen:"
curl -s -m 10 http://127.0.0.1:12000/api/villas | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("  (Villenliste ohne Anmeldung nicht lesbar)"); raise SystemExit
for v in (d if isinstance(d,list) else []):
    print("  #%s %-10s %s" % (v.get("id"), v.get("status"), v.get("name")))
' 2>/dev/null
echo "Version im Ziel: $(sudo grep -m1 '"version"' /opt/villaforge/package.json)"
echo "OK: Hub laeuft auf Agentforge2 main"

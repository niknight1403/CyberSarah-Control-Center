#!/usr/bin/env bash
# Read-only: Quelle (source_path) der Villen und Testaufbau im Projektordner.
set -uo pipefail

DB=/opt/villaforge/data/hub.db

echo "== Hub-Umgebung (nur VF_/WORKSPACE) =="
sudo -n grep -iE "VF_|WORKSPACE|NODE_ENV" /opt/villaforge/hub.env 2>/dev/null | sed 's/=.*TOKEN.*/=<verdeckt>/' | head -10

echo "== Villen in der DB =="
sudo -n node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("/opt/villaforge/data/hub.db");
for (const v of db.prepare("SELECT id, name, status, source_path FROM villas ORDER BY id").all()) {
  console.log(`${v.id}\t${v.status}\t${v.source_path || "-"}\t${String(v.name).slice(0,40)}`);
}
' 2>/dev/null

echo "== Projektordner der Fokusvillen =="
for VID in 34 3; do
  SRC=$(sudo -n node --experimental-sqlite -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('/opt/villaforge/data/hub.db');
    const r = db.prepare('SELECT source_path FROM villas WHERE id=?').get($VID);
    process.stdout.write(r?.source_path || '');
  " 2>/dev/null)
  DIR="${SRC:-/opt/villaforge/workspace/villa-$VID/project}"
  echo "--- Villa $VID: $DIR ---"
  [ -d "$DIR" ] || { echo "  (fehlt)"; continue; }
  sudo -n ls -la "$DIR" | head -8
  echo "  Dateien:"; sudo -n find "$DIR" -maxdepth 2 -not -path "*/node_modules*" -type f 2>/dev/null | head -12
  echo "  package.json:"; sudo -n head -25 "$DIR/package.json" 2>/dev/null
  echo "  node_modules: $(sudo -n test -d "$DIR/node_modules" && echo ja || echo nein)"
  echo "  jest binär: $(sudo -n test -x "$DIR/node_modules/.bin/jest" && echo ja || echo nein)"
  echo "  Python: $(sudo -n find "$DIR" -name '*.py' -not -path '*/node_modules*' 2>/dev/null | wc -l) Dateien"
done

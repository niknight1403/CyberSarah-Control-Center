#!/usr/bin/env bash
# Read-only: Datenbank inklusive WAL kopieren und daraus lesen.
set -uo pipefail

TMP=/tmp/dbcheck-$$
mkdir -p "$TMP"
sudo -n cp /opt/villaforge/data/hub.db "$TMP/hub.db" 2>/dev/null || { echo "DB nicht kopierbar"; exit 1; }
sudo -n cp /opt/villaforge/data/hub.db-wal "$TMP/hub.db-wal" 2>/dev/null || true
sudo -n cp /opt/villaforge/data/hub.db-shm "$TMP/hub.db-shm" 2>/dev/null || true
sudo -n chown -R "$(id -u):$(id -g)" "$TMP" 2>/dev/null || true
echo "Kopie: $(du -sh "$TMP" | cut -f1)"

TMP="$TMP" node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
const path = process.env.TMP + "/hub.db";
const db = new DatabaseSync(path);
console.log("== Villen ==");
for (const v of db.prepare("SELECT id, status, source_path, name FROM villas ORDER BY id").all()) {
  console.log(`${v.id}\t${v.status}\t${v.source_path || "-"}\t${String(v.name).slice(0,45)}`);
}
console.log("== Aufgaben der Fokusvillen ==");
for (const id of [34, 3]) {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM tasks WHERE villa_id=? GROUP BY status").all(id);
  console.log(`Villa ${id}: ` + rows.map(r => r.status + "=" + r.c).join("  "));
}
' 2>&1 | head -40

echo "== Projektordner pruefen =="
for VID in 34 3; do
  SRC=$(TMP="$TMP" VID="$VID" node --experimental-sqlite -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.env.TMP + "/hub.db");
    const r = db.prepare("SELECT source_path FROM villas WHERE id=?").get(Number(process.env.VID));
    process.stdout.write(r?.source_path || "");
  ' 2>/dev/null)
  echo "--- Villa $VID source_path: ${SRC:-(leer)} ---"
  for DIR in "$SRC" "/opt/villaforge/workspace/villa-$VID/project" "/opt/villaforge/workspace/villa-$VID"; do
    [ -n "$DIR" ] && [ -d "$DIR" ] || continue
    echo "  Ordner: $DIR"
    sudo -n find "$DIR" -maxdepth 1 -not -path "*/node_modules*" 2>/dev/null | head -8
    if sudo -n test -f "$DIR/package.json"; then
      echo "  package.json:"; sudo -n head -20 "$DIR/package.json"
      echo "  node_modules: $(sudo -n test -d "$DIR/node_modules" && echo ja || echo nein)"
      echo "  jest: $(sudo -n test -x "$DIR/node_modules/.bin/jest" && echo vorhanden || echo fehlt)"
    fi
    break
  done
done
sudo -n rm -rf "$TMP"

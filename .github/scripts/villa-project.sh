#!/usr/bin/env bash
# Read-only: Warum zeigt die Datei 1 Villa, die API aber viele?
set -uo pipefail
DBPATH=/opt/villaforge/data/hub.db
PID=$(pgrep -f "server/server[.]mjs" | head -1)
echo "== Hub-PID: ${PID:-keine} =="

echo "== Inode der Datei auf der Platte =="
sudo -n stat -c 'inode=%i groesse=%s geaendert=%y' "$DBPATH" 2>/dev/null
sudo -n stat -c 'inode=%i groesse=%s geaendert=%y' "$DBPATH-wal" 2>/dev/null

echo "== Inodes der offenen Deskriptoren =="
sudo -n ls -li /proc/$PID/fd 2>/dev/null | grep -iE "\.db" | head -10

echo "== Sicht des Prozesses =="
sudo -n readlink /proc/$PID/root 2>/dev/null
sudo -n stat -L -c 'inode=%i groesse=%s' /proc/$PID/root/opt/villaforge/data/hub.db 2>/dev/null

echo "== Direktlesen der laufenden Datei =="
sudo -n node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("/opt/villaforge/data/hub.db");
console.log("journal_mode:", JSON.stringify(db.prepare("PRAGMA journal_mode").get()));
const v = db.prepare("SELECT COUNT(*) c, MAX(id) m FROM villas").get();
console.log("villas:", v.c, "max id:", v.m);
console.log("tasks:", db.prepare("SELECT COUNT(*) c FROM tasks").get().c);
for (const r of db.prepare("SELECT id, status, substr(name,1,40) n FROM villas ORDER BY id LIMIT 20").all()) {
  console.log("  ", r.id, r.status, r.n);
}
' 2>&1 | grep -viE "experimentalwarning|trace-warnings"

echo "== Kopie inkl. WAL =="
TMP=/tmp/dbgate-$$
mkdir -p "$TMP"
sudo -n cp "$DBPATH" "$TMP/hub.db"
if sudo -n cp "$DBPATH-wal" "$TMP/hub.db-wal" 2>/dev/null; then echo "WAL mitkopiert"; else echo "keine WAL"; fi
sudo -n cp "$DBPATH-shm" "$TMP/hub.db-shm" 2>/dev/null || true
sudo -n chown -R "$(id -u):$(id -g)" "$TMP"
TMP="$TMP" node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.TMP + "/hub.db");
console.log("Kopie villas:", db.prepare("SELECT COUNT(*) c FROM villas").get().c);
' 2>&1 | grep -viE "experimentalwarning|trace-warnings"

echo "== Tabellen mit Inhalt (Kopie) =="
TMP="$TMP" node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.TMP + "/hub.db");
for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all("table")) {
  try {
    const c = db.prepare("SELECT COUNT(*) c FROM \"" + t.name + "\"").get().c;
    if (c > 0) console.log("  " + t.name + ": " + c);
  } catch (e) { console.log("  " + t.name + ": nicht lesbar"); }
}
' 2>&1 | grep -viE "experimentalwarning|trace-warnings"
sudo -n rm -rf "$TMP"

echo "== API-Sicht =="
TOK=$(curl -s -m 25 -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$VF_HUB_EMAIL\",\"password\":\"$VF_HUB_PASSWORD\"}" \
  https://hub.cybersarah-ki.com/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOK" ]; then
  curl -s -m 25 -H "Authorization: Bearer $TOK" https://hub.cybersarah-ki.com/api/villas | python3 -c '
import json,sys
d=json.load(sys.stdin)
d=d if isinstance(d,list) else d.get("villas",[])
print("  API villas:", len(d))
for v in d[:20]: print("  ", v.get("id"), v.get("status"), str(v.get("name"))[:38])
'
else
  echo "  (kein Login moeglich)"
fi

echo "== weitere DB-Dateien =="
sudo -n find /opt /root -maxdepth 4 \( -name "*.db" -o -name "*.sqlite" \) 2>/dev/null | while read -r f; do
  echo "  $(sudo -n stat -c '%i %s %y' "$f" 2>/dev/null) $f"
done

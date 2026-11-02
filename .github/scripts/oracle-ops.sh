#!/usr/bin/env bash
# Oracle-VM "ollama-free-a1" (Live-Hub) read-only warten.
# Erwartet: ORACLE_SSH_KEY (privater Schluessel), ORACLE_HOST, ORACLE_USER.
set -uo pipefail

if [ -z "${ORACLE_SSH_KEY:-}" ]; then
  cat <<'HINWEIS'
ORACLE_SSH_KEY ist nicht hinterlegt - ohne Schluessel kommt niemand an die Live-VM.

Einmalig auf dem eigenen Rechner:
  ssh-keygen -t ed25519 -C "oracle-villaforge" -f ~/.ssh/oracle_villaforge -N ""
  # oeffentlichen Schluessel auf der VM eintragen (OCI-Konsole -> Cloud Shell):
  #   echo "<Inhalt von oracle_villaforge.pub>" >> ~/.ssh/authorized_keys
  # privaten Schluessel als Repo-Secret hinterlegen:
  #   Settings -> Secrets and variables -> Actions -> New repository secret
  #   Name: ORACLE_SSH_KEY     Wert: kompletter Inhalt von oracle_villaforge
  # Optional: ORACLE_SSH_HOST (Standard 92.5.177.159), ORACLE_SSH_USER (Standard ubuntu)

Danach diesen Lauf wiederholen.
HINWEIS
  exit 1
fi

KEYFILE="$HOME/.ssh/oracle_key"
mkdir -p "$HOME/.ssh"
printf '%s\n' "$ORACLE_SSH_KEY" > "$KEYFILE"
chmod 600 "$KEYFILE"

echo "== Schluessel-Fingerabdruck =="
ssh-keygen -y -f "$KEYFILE" 2>/dev/null | cut -c1-60 || echo "  Schluessel nicht lesbar"

HOST="${ORACLE_HOST:-92.5.177.159}"
USER_NAME="${ORACLE_USER:-ubuntu}"
echo "== Verbindung zu ${USER_NAME}@${HOST} =="

ssh -i "$KEYFILE" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
  "${USER_NAME}@${HOST}" 'bash -s' <<'REMOTE'
set -uo pipefail
echo "host: $(hostname)"
echo "kernel: $(uname -r) | uptime: $(uptime -p 2>/dev/null)"
echo "disk: $(df -P / | awk 'NR==2{print $5" belegt, "$4" frei"}')"
echo "mem: $(free -m | awk '/Mem:/{print $3"MB von "$2"MB"}')"

echo "== Dienste =="
for U in villaforge villaforge-hub hub watchdog ollama; do
  S=$(systemctl is-active "$U" 2>/dev/null)
  [ -n "$S" ] && echo "  $U: $S"
done

echo "== Hub-Prozess =="
PID=$(pgrep -f "server[.]mjs" | head -1)
if [ -n "${PID:-}" ]; then
  echo "  PID $PID | cwd $(readlink /proc/$PID/cwd 2>/dev/null)"
  echo "  $(tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep -E '^VF_DB=' || echo 'VF_DB nicht gesetzt')"
else
  echo "  kein Hub-Prozess gefunden"
fi

echo "== Datendateien =="
ls -l /opt/villaforge/data/ 2>/dev/null | head -8
du -h /opt/villaforge/data/hub.db* 2>/dev/null

echo "== Villen in der Live-DB =="
node --experimental-sqlite -e '
const { DatabaseSync } = require("node:sqlite");
try {
  const db = new DatabaseSync("/opt/villaforge/data/hub.db");
  const v = db.prepare("SELECT COUNT(*) c FROM villas").get();
  const t = db.prepare("SELECT COUNT(*) c FROM tasks").get();
  console.log("  villas:", v.c, "| tasks:", t.c);
  for (const r of db.prepare("SELECT id, status, substr(name,1,42) n FROM villas ORDER BY id LIMIT 20").all()) {
    console.log("  ", r.id, r.status, r.n);
  }
} catch (e) { console.log("  Lesefehler:", String(e.message).split("\n")[0]); }
' 2>&1 | grep -viE "experimentalwarning|trace-warnings"

echo "== letzte Backups =="
ls -lt /opt/villaforge/data/*.bak /opt/vf-db-backup-* 2>/dev/null | head -5 || echo "  keine"
REMOTE

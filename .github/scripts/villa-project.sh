#!/usr/bin/env bash
# Read-only: Ist die Domain derselbe Prozess wie hier? Und gibt es einen Weg zur Oracle-VM?
set -uo pipefail

echo "== Health der Domain (voll, ohne Geheimnisse) =="
curl -s -m 10 https://hub.cybersarah-ki.com/api/health | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k,v in d.items():
    s=str(v)
    print(f"  {k}: {s[:160]}")
' 2>/dev/null || echo "  keine JSON-Antwort"

echo "== Health lokal (voll) =="
curl -s -m 8 http://127.0.0.1:12000/api/health | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k,v in d.items():
    s=str(v)
    print(f"  {k}: {s[:160]}")
' 2>/dev/null || echo "  keine JSON-Antwort"

echo "== Startzeit des lokalen Hub-Prozesses =="
PID=$(pgrep -f "server/server[.]mjs" | head -1)
ps -o pid,lstart,etimes -p "$PID" 2>/dev/null
sudo -n systemctl show villaforge -p ExecMainStartTimestamp -p ActiveEnterTimestamp 2>/dev/null

echo "== Versuch: Oracle-VM mit vorhandenen Schluesseln =="
for U in root ubuntu opc; do
  for K in /root/.ssh/id_ed25519 /root/.ssh/id_rsa; do
    [ -f "$K" ] || continue
    OUT=$(sudo -n timeout 10 ssh -i "$K" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=6 "$U"@92.5.177.159 'hostname; ls -d /opt/villaforge 2>/dev/null' 2>&1 | head -3)
    echo "  $U mit $(basename "$K"): $OUT"
  done
done

echo "== Dienste, die die Oracle-IP nutzen =="
sudo -n systemctl cat revenue-bridge-relay.service 2>/dev/null | grep -iE "ExecStart|Environment|ssh|scp" | head -8

echo "== vorhandene SSH-Konfigurationen =="
sudo -n ls /root/.ssh 2>/dev/null | head -10
sudo -n cat /root/.ssh/config 2>/dev/null | head -20

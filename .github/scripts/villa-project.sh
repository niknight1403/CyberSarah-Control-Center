#!/usr/bin/env bash
# Read-only: Alle Node-Prozesse, ihre Ports und ihre Datenbank.
set -uo pipefail

echo "== alle node-Prozesse =="
for P in $(pgrep -f "node" | head -25); do
  CMD=$(sudo -n tr '\0' ' ' < /proc/$P/cmdline 2>/dev/null | cut -c1-90)
  CWD=$(sudo -n readlink /proc/$P/cwd 2>/dev/null)
  DB=$(sudo -n tr '\0' '\n' < /proc/$P/environ 2>/dev/null | grep -E '^VF_DB=' | head -1)
  PORTS=$(sudo -n ss -lntp 2>/dev/null | grep "pid=$P," | awk '{print $4}' | tr '\n' ' ')
  echo "  PID $P | $CMD | cwd=$CWD | $DB | ports=${PORTS:-keine}"
done 2>/dev/null | head -30

echo "== hoerende Ports gesamt =="
sudo -n ss -lntp 2>/dev/null | grep -E ":(12000|12001|12002|3000|3001|3002|4000|8080)\b" | head -10

echo "== Vergleich lokaler Hub gegen Domain (mit Admin-Token) =="
TOKEN=$(sudo -n grep -E '^VF_TOKEN=' /opt/villaforge/hub.env 2>/dev/null | cut -d= -f2)
for BASE in "http://127.0.0.1:12000" "https://hub.cybersarah-ki.com"; do
  N=$(curl -s -m 15 -H "x-api-key: ${TOKEN}" "$BASE/api/villas" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("keine JSON-Antwort"); raise SystemExit
d = d if isinstance(d,list) else d.get("villas", [])
print(len(d), "Villen", [v.get("id") for v in d][:12])
' 2>/dev/null)
  echo "  $BASE -> ${N:-keine Antwort}"
done

echo "== Kennzahlen aus der lokalen DB vs. API =="
sudo -n curl -s -m 10 -o /dev/null -w "  lokal /api/villas mit Token: %{http_code}\n" -H "x-api-key: ${TOKEN}" http://127.0.0.1:12000/api/villas

echo "== Caddy: welche Upstreams nutzt es wirklich? =="
sudo -n grep -n -E "reverse_proxy|:12000|:12001" /etc/caddy/Caddyfile 2>/dev/null | head -12

echo "== kommen Anfragen der Domain hier an? =="
sudo -n sh -c 'ls -la /var/log/caddy 2>/dev/null | head -5' || echo "  kein Caddy-Log"

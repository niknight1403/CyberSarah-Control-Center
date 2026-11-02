#!/usr/bin/env bash
# Read-only: Identitaet des SSH-Ziels und wer Port 12000 bedient.
set -uo pipefail

echo "== Host =="
hostname
hostname -I 2>/dev/null
curl -s -m 8 https://ifconfig.me 2>/dev/null; echo " <- oeffentliche IP"

echo "== Port 12000 =="
sudo -n ss -lntp 2>/dev/null | grep -E ":12000\b" || ss -lntp 2>/dev/null | grep -E ":12000\b" || echo "niemand hoert auf 12000"

echo "== villaforge-Prozesse =="
pgrep -af "server/server[.]mjs" | head -5
echo "== Docker/Container =="
(sudo -n docker ps --format '{{.ID}} {{.Image}} {{.Ports}} {{.Names}}' 2>/dev/null | head -8) || echo "kein docker"
echo "== pm2 =="
(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print('pm2 nicht lesbar'); raise SystemExit
for p in d: print(p.get('name'), p.get('pm2_env',{}).get('status'), p.get('pm2_env',{}).get('pm_cwd'))
" 2>/dev/null) || echo "pm2 nicht vorhanden"

echo "== Caddy-vhost fuer den Hub =="
sudo -n grep -n -A4 "hub.cybersarah-ki.com" /etc/caddy/Caddyfile 2>/dev/null | head -12
echo "== Version des laufenden Codes =="
sudo -n grep -m1 '"version"' /opt/villaforge/package.json
echo "== enthaelt der laufende Code den neuen Gate-Text? =="
sudo -n grep -c "Qualitaetstor blockiert" /opt/villaforge/server/agents.mjs 2>/dev/null || echo "nicht gefunden"
sudo -n grep -c "project-focus" /opt/villaforge/server/*.mjs 2>/dev/null | grep -v ":0" | head -5

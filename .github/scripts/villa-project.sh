#!/usr/bin/env bash
# Read-only: Wo laeuft der echte Hub? Diese VM oder die Oracle-VM?
set -uo pipefail

echo "== DNS von der VM aus =="
getent hosts hub.cybersarah-ki.com || echo "  keine Aufloesung"
echo "  eigene IPs: $(hostname -I 2>/dev/null)"

echo "== villa-sync.mjs (Kopf) =="
sudo -n head -40 /opt/villaforge/villa-sync.mjs 2>/dev/null || echo "  nicht vorhanden"

echo "== Zeitgeber und Cron =="
sudo -n systemctl list-timers --all --no-pager 2>/dev/null | grep -iE "villa|sync|forge" | head -5
sudo -n crontab -l 2>/dev/null | grep -iE "villa|sync|forge|oracle" | head -5
sudo -n ls /etc/cron.d 2>/dev/null | head -10

echo "== Verweise auf die Oracle-IP =="
sudo -n grep -rl "92\.5\.177\.159" /opt/villaforge /etc/systemd/system /etc/cron* 2>/dev/null | head -8

echo "== Antwortvergleich lokal vs. Domain =="
echo "  lokal  : $(curl -s -m 8 http://127.0.0.1:12000/api/health | head -c 120)"
echo "  domain : $(curl -s -m 8 https://hub.cybersarah-ki.com/api/health | head -c 120)"

echo "== kommt die Domain-Antwort von hier? =="
sudo -n tail -3 /var/log/caddy/access.log 2>/dev/null | head -3 || echo "  kein Caddy-Zugriffslog lesbar"

echo "== Villen laut Domain =="
TOK=$(curl -s -m 25 -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"${VF_HUB_EMAIL:-}\",\"password\":\"${VF_HUB_PASSWORD:-}\"}" \
  https://hub.cybersarah-ki.com/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOK" ]; then
  curl -s -m 25 -H "Authorization: Bearer $TOK" https://hub.cybersarah-ki.com/api/villas | python3 -c '
import json,sys
d=json.load(sys.stdin); d=d if isinstance(d,list) else d.get("villas",[])
print("  Domain villas:", len(d), "ids:", [v.get("id") for v in d][:20])
'
else
  echo "  (kein Login)"
fi

echo "== Villen laut lokalem Port =="
curl -s -m 8 -o /dev/null -w "  lokal /api/villas ohne Token: %{http_code}\n" http://127.0.0.1:12000/api/villas

echo "== SSH von hier zur Oracle-VM? =="
for K in /root/.ssh/id_ed25519 /root/.ssh/id_rsa /root/.ssh/oracle /opt/villaforge/.ssh/id_ed25519; do
  [ -f "$K" ] && echo "  Schluessel vorhanden: $K"
done
sudo -n timeout 8 ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@92.5.177.159 'echo oracle-erreichbar; hostname' 2>&1 | head -3

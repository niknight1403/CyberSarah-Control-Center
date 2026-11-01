#!/usr/bin/env bash
# Read-only Audit der Ports und Firewall-Regeln. Aendert nichts.
set -uo pipefail

echo "== 1. Lauschende Sockets (TCP) =="
ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/'

echo "== 2. ufw-Status (nummeriert) =="
ufw status numbered 2>/dev/null || echo "ufw nicht verfuegbar"

echo "== 3. ufw Defaults =="
ufw status verbose 2>/dev/null | grep -E "Default|Logging" || true

echo "== 4. Docker-Ports (Docker umgeht ufw) =="
docker ps --format '{{.Names}} | {{.Ports}}' 2>/dev/null || echo "kein Docker"

echo "== 5. iptables: DOCKER-Ketten (veroeffentlichte Ports) =="
iptables -t nat -S 2>/dev/null | grep -E "DNAT|MASQUERADE" | head -15 || echo "keine DNAT-Regeln"
echo "--- INPUT-Policy und Ausnahmen ---"
iptables -S INPUT 2>/dev/null | head -15

echo "== 6. Wer haelt Port 3000? =="
ss -tlnp 2>/dev/null | grep ':3000' || echo "niemand"
echo "--- Konflikt: Docker veroeffentlicht 3000? ---"
docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep ':3000'

echo "== 7. Dienste, die nur lokal lauschen sollten =="
for port in 5432 11434 6379; do
  line=$(ss -tlnp 2>/dev/null | grep ":$port " || true)
  if [ -n "$line" ]; then echo "  $port: $line"; else echo "  $port: niemand"; fi
done

echo "== 8. Caddy-Sites =="
grep -E "^[a-z0-9*-]|^\{" /etc/caddy/Caddyfile 2>/dev/null | head -20

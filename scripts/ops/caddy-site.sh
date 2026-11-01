#!/usr/bin/env bash
# Legt einen Caddy-Site-Block fuer einen Hostnamen an und laedt Caddy neu.
# Aufruf: bash scripts/ops/caddy-site.sh <hostname>
set -uo pipefail

HOST="${1:-167.233.196.20.sslip.io}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"

echo "== Caddy-Status =="
systemctl is-active caddy 2>/dev/null || echo "caddy nicht als Dienst erkannt"
echo "== Aktuelle Konfiguration =="
cat "$CADDYFILE" 2>/dev/null || { echo "FEHLER: $CADDYFILE fehlt"; exit 1; }

if grep -qE "^[^#]*${HOST//./\\.}" "$CADDYFILE" 2>/dev/null; then
  echo "== Site fuer $HOST existiert bereits =="
else
  echo "== Site fuer $HOST anlegen =="
  cp "$CADDYFILE" "${CADDYFILE}.bak-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDYFILE" <<EOF

${HOST} {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
EOF
  echo "Block ergaenzt."
fi

echo "== Konfiguration pruefen =="
if caddy validate --config "$CADDYFILE" --adapter caddyfile 2>&1 | tail -4; then
  echo "== Caddy neu laden =="
  systemctl reload caddy 2>&1 || systemctl restart caddy 2>&1
  sleep 3
  echo "== Lokaler Test =="
  curl -s -o /dev/null -w "http://127.0.0.1:80 mit Host-Header: %{http_code}\n" --max-time 8 -H "Host: $HOST" http://127.0.0.1/api/ready
else
  echo "FEHLER: Konfiguration ungueltig, kein Reload"
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

cd /opt/cybersarah-control-center
node scripts/validate-production.mjs

if pm2 describe cybersarah-backend >/dev/null 2>&1; then
  pm2 describe cybersarah-backend >/dev/null
elif pm2 describe cybersarah-control-center >/dev/null 2>&1; then
  pm2 describe cybersarah-control-center >/dev/null
else
  echo "FEHLER: Keine erwartete PM2-Anwendung gefunden." >&2
  exit 1
fi
echo "OK: PM2-Anwendung vorhanden"

nginx -t
if nginx -T 2>/dev/null | grep -Eq 'server_name[^;]*app\.cybersarah-ki\.com'; then
  echo "OK: Nginx-Konfiguration enthält app.cybersarah-ki.com"
else
  echo "FEHLER: Kein Nginx-Serverblock für app.cybersarah-ki.com gefunden." >&2
  exit 1
fi

echo "Produktionsprüfung erfolgreich abgeschlossen"

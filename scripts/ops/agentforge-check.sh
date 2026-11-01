#!/usr/bin/env bash
# Prueft Tabellen, Token-Konfiguration und Erreichbarkeit der Agentforge-Routen.
set -uo pipefail
cd /opt/cybersarah-control-center || exit 1

echo "== PM2 (vollstaendig) =="
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s))console.log(`  ${p.name}: ${p.pm2_env?.status} (Restarts: ${p.pm2_env?.restart_time})`);}catch{console.log("  nicht lesbar")}})'

echo "== Agentforge-Tabellen =="
set -a; . ./.env 2>/dev/null; set +a
if [ -n "${DATABASE_URL:-}" ]; then
  for t in agentforge_events agentforge_task_states agentforge_checkpoints; do
    exists=$(psql "$DATABASE_URL" -tAc "select to_regclass('public.$t')" 2>/dev/null)
    if [ -n "$exists" ]; then
      n=$(psql "$DATABASE_URL" -tAc "select count(*) from $t" 2>/dev/null)
      echo "  $t: vorhanden, $n Zeilen"
    else
      echo "  $t: FEHLT"
    fi
  done
else
  echo "  DATABASE_URL nicht lesbar"
fi

echo "== Token konfiguriert? =="
if [ -n "${AGENTFORGE_TELEMETRY_TOKEN:-}" ]; then
  echo "  AGENTFORGE_TELEMETRY_TOKEN: gesetzt (${#AGENTFORGE_TELEMETRY_TOKEN} Zeichen)"
else
  echo "  AGENTFORGE_TELEMETRY_TOKEN: nicht gesetzt (Routen antworten mit 503)"
fi

echo "== Health =="
curl -s -o /dev/null -w "  /api/ready: %{http_code}\n" --max-time 10 http://localhost:3000/api/ready

#!/usr/bin/env bash
# Legt die Agentforge-Tabellen an und setzt den Service-Token, damit die
# Telemetrie-Routen nicht mehr mit 503 antworten. Idempotent.
set -uo pipefail
cd /opt/cybersarah-control-center || exit 1
set -a; . ./.env 2>/dev/null; set +a
[ -n "${DATABASE_URL:-}" ] || { echo "FEHLER: DATABASE_URL fehlt"; exit 1; }

echo "== Tabellen anlegen (idempotent) =="
psql "$DATABASE_URL" -q -f drizzle/0017_agentforge_mesh.sql 2>&1 | tail -3
for t in agentforge_events agentforge_task_states agentforge_checkpoints; do
  echo "  $t: $(psql "$DATABASE_URL" -tAc "select coalesce(to_regclass('public.$t')::text,'FEHLT')")"
done

echo "== Service-Token =="
if [ -n "${AGENTFORGE_TELEMETRY_TOKEN:-}" ]; then
  echo "  bereits gesetzt (${#AGENTFORGE_TELEMETRY_TOKEN} Zeichen)"
else
  NEW_TOKEN=$(openssl rand -hex 32)
  cp .env .env.bak-agentforge 2>/dev/null && chmod 600 .env.bak-agentforge 2>/dev/null
  if grep -q '^AGENTFORGE_TELEMETRY_TOKEN=' .env 2>/dev/null; then
    sed -i "s|^AGENTFORGE_TELEMETRY_TOKEN=.*|AGENTFORGE_TELEMETRY_TOKEN=$NEW_TOKEN|" .env
  else
    printf '\nAGENTFORGE_TELEMETRY_TOKEN=%s\n' "$NEW_TOKEN" >> .env
  fi
  chmod 600 .env
  AGENTFORGE_TELEMETRY_TOKEN="$NEW_TOKEN"
  export AGENTFORGE_TELEMETRY_TOKEN
  echo "  neu erzeugt (${#AGENTFORGE_TELEMETRY_TOKEN} Zeichen), in .env mit 600 gespeichert"
fi

echo "== App neu starten =="
pm2 restart cybersarah-control-center --update-env > /dev/null 2>&1
for i in $(seq 1 15); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/ready 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "  health: 200 (Versuch $i)"; break; }
done

echo "== Endpunkte =="
EVENT_ID="healthprobe-$(date +%s)"
AT=$(date +%s%3N)
no=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 8 -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/agentforge/events)
echo "  events ohne Token:  $no (erwartet 401)"
yes_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 8 -H "Content-Type: application/json" -H "Authorization: Bearer ${AGENTFORGE_TELEMETRY_TOKEN}" -d "{\"id\":\"$EVENT_ID\",\"type\":\"task.created\",\"at\":$AT,\"taskId\":\"1\",\"status\":\"RUNNING\"}" http://localhost:3000/api/agentforge/events)
echo "  events mit Token:   $yes_code (erwartet 202)"
cp_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 8 -H "Content-Type: application/json" -H "Authorization: Bearer ${AGENTFORGE_TELEMETRY_TOKEN}" -d '{}' http://localhost:3000/api/agentforge/checkpoints)
echo "  checkpoints leerer Body: $cp_code (erwartet 400)"
st=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "http://localhost:3000/api/agentforge/stream")
echo "  stream ohne Session: $st (erwartet 401)"

rows=$(psql "$DATABASE_URL" -tAc "select count(*) from agentforge_events where event_id='$EVENT_ID'" 2>/dev/null)
echo "  Testevent in der DB: $rows"
psql "$DATABASE_URL" -q -c "delete from agentforge_events where event_id='$EVENT_ID'" >/dev/null 2>&1
psql "$DATABASE_URL" -q -c "delete from agentforge_task_states where task_id='1' and last_event_id='$EVENT_ID'" >/dev/null 2>&1
echo "  Testdaten wieder entfernt"
echo "  Token-Laenge: ${#AGENTFORGE_TELEMETRY_TOKEN}"

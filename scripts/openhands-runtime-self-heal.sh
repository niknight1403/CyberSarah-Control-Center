#!/usr/bin/env bash
set -euo pipefail

COMPOSE=/opt/openhands/docker-compose.yml
APP_CONTAINER=openhands-autonomous-app
RUNTIME_IMAGE=ghcr.io/all-hands-ai/runtime:0.28-nikolaik
BASE=http://localhost:3001
WORKSPACE=/opt/openhands/workspace
RESULT="$WORKSPACE/openhands-runtime-smoke.txt"

test -f "$COMPOSE"
APP_IMAGE="$(docker inspect "$APP_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"
case "$APP_IMAGE" in
  *openhands*0.28*) ;;
  *) echo "Unerwartete OpenHands-Version: $APP_IMAGE"; exit 1 ;;
esac

RUNTIME_CACHED=0
if docker image inspect "$RUNTIME_IMAGE" >/dev/null 2>&1; then
  RUNTIME_CACHED=1
fi

echo "Docker-Speicher fuer die Runtime vorbereiten ..."
docker ps -aq --filter name=openhands-runtime- | xargs -r docker rm -f >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
if [ "$RUNTIME_CACHED" -eq 0 ]; then
  docker image prune -af >/dev/null 2>&1 || true
fi
apt-get clean >/dev/null 2>&1 || true
journalctl --vacuum-size=100M >/dev/null 2>&1 || true
if command -v snap >/dev/null 2>&1; then
  snap list --all 2>/dev/null | awk '$6=="disabled" {print $1, $3}' | while read -r name rev; do
    [ -n "$name" ] && [ -n "$rev" ] && snap remove "$name" --revision="$rev" >/dev/null 2>&1 || true
  done
  rm -f /var/lib/snapd/cache/* 2>/dev/null || true
fi
rm -rf /var/lib/apt/lists/* 2>/dev/null || true
rm -rf /root/.npm/_cacache /root/.cache/pip /tmp/openhands-* /tmp/bx 2>/dev/null || true
rm -f /usr/share/ollama/.ollama/models/blobs/*-partial 2>/dev/null || true

FREE_KB="$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')"
echo "Freier Docker-Speicher nach Cleanup: $((FREE_KB / 1024)) MB"

# 38-GB-Host: falls die Runtime noch nicht gecacht ist, schafft das alte
# lokale 7B-Modell Platz. LLM-Routing bleibt ueber Remote-Ollama/Free-Failover aktiv.
if [ "$RUNTIME_CACHED" -eq 0 ] && [ "$FREE_KB" -lt 7340032 ] && command -v ollama >/dev/null 2>&1; then
  if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx 'qwen2.5-coder:7b'; then
    echo "Ressourcenprofil: lokales 7B-Modell entfernen; Self-hosted/Free-Failover uebernimmt LLM-Routing"
    ollama rm qwen2.5-coder:7b >/dev/null
  fi
  if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx 'qwen2.5-coder:latest'; then
    ollama rm qwen2.5-coder:latest >/dev/null
  fi
  FREE_KB="$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')"
  echo "Freier Speicher nach Modell-Rebalancing: $((FREE_KB / 1024)) MB"
fi

if [ "$RUNTIME_CACHED" -eq 0 ] && [ "$FREE_KB" -lt 7340032 ]; then
  echo "Zu wenig freier Speicher fuer die 5+ GB Runtime plus Extraktion."
  docker system df || true
  echo "== Dateisysteme =="
  df -hT || true
  echo "== Relevante Speicherbereiche =="
  du -xsh /var/lib/docker /opt /root /var/log /var/cache 2>/dev/null || true
  echo "== Blockgeraete =="
  lsblk -f || true
  exit 1
fi

if [ "$RUNTIME_CACHED" -eq 0 ]; then
  echo "Passendes OpenHands-0.28-Runtime-Image vorladen ..."
  docker pull "$RUNTIME_IMAGE" >/dev/null
else
  echo "Passendes OpenHands-0.28-Runtime-Image bereits lokal vorhanden."
fi

# Kein zweites lokales Modell auf dem 38-GB-Host nachladen: die vorhandene
# Remote-Ollama/Free-Cloud-Kaskade liefert das LLM, die Runtime bleibt lokal.
rm -f /usr/share/ollama/.ollama/models/blobs/*-partial 2>/dev/null || true
DOCKER_HOST_IP="$(docker inspect "$APP_CONTAINER" --format '{{range .NetworkSettings.Networks}}{{println .Gateway}}{{end}}' 2>/dev/null | awk 'NF {print; exit}')"
[ -n "$DOCKER_HOST_IP" ] || { echo "Docker-Host-Gateway nicht ermittelbar"; exit 1; }
echo "OpenHands Runtime-Rueckroute: $DOCKER_HOST_IP"

python3 - "$COMPOSE" "$RUNTIME_IMAGE" "$DOCKER_HOST_IP" <<'PY'
from pathlib import Path
import re, sys
path = Path(sys.argv[1])
image = sys.argv[2]
host_ip = sys.argv[3]
text = path.read_text()
marker = "    environment:\n"
if marker not in text:
    raise SystemExit("environment-Block im OpenHands-Service fehlt")

def set_env(name: str, value: str) -> None:
    global text
    entry = f"      - {name}={value}"
    pattern = rf"(?m)^\s*-\s*{re.escape(name)}=.*$"
    if re.search(pattern, text):
        text = re.sub(pattern, entry, text, count=1)
    else:
        text = text.replace(marker, marker + entry + "\n", 1)

set_env("SANDBOX_RUNTIME_CONTAINER_IMAGE", image)
set_env("DOCKER_HOST_IP", host_ip)

# OpenHands 0.28 erreicht die dynamisch publizierten Runtime-Ports ueber
# host.docker.internal. Auf Linux muss der Host-Gateway explizit gesetzt sein.
if "host.docker.internal:host-gateway" not in text:
    service = "  openhands:\n"
    if service not in text:
        raise SystemExit("openhands-Service im Compose fehlt")
    text = text.replace(
        service,
        service + '    extra_hosts:\n      - "host.docker.internal:host-gateway"\n',
        1,
    )
path.write_text(text)
PY

cd /opt/openhands
docker compose config >/dev/null
docker compose up -d --force-recreate openhands >/dev/null

for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE" || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE" || true)" = "200" ]

docker inspect "$APP_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Fx "SANDBOX_RUNTIME_CONTAINER_IMAGE=$RUNTIME_IMAGE" >/dev/null
echo "Freier Speicher vor Agent-Smoke: $(( $(df -Pk / | awk 'NR==2 {print $4}') / 1024 )) MB"

rm -f "$RESULT"
CONV="$(curl -fsS --max-time 30 -X POST "$BASE/api/conversations" \
  -H 'Content-Type: application/json' \
  --data-binary '{"initial_user_msg":"Erstelle im Workspace die Datei openhands-runtime-smoke.txt mit exakt dem Inhalt OPENHANDS-RUNTIME-OK und antworte kurz mit DONE.","agent":"CodeActAgent"}')"
CID="$(printf '%s' "$CONV" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("conversation_id",""))')"
[ -n "$CID" ]

for _ in $(seq 1 120); do
  if grep -qx 'OPENHANDS-RUNTIME-OK' "$RESULT" 2>/dev/null; then
    echo "OPENHANDS_RUNTIME_SMOKE=PASS"
    exit 0
  fi
  META="$(curl -fsS --max-time 10 "$BASE/api/conversations/$CID" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(d.get("status","?"))+"|"+str(d.get("runtime_status","?")))' 2>/dev/null || echo '?|?')"
  STATUS="${META%%|*}"
  RUNTIME_STATUS="${META#*|}"
  case "$STATUS" in
    STOPPED|ERROR|stopped|error)
      echo "Agent stoppte vor erfolgreichem Dateibeweis: status=$STATUS runtime=$RUNTIME_STATUS"
      echo "== Runtime-Container =="
      docker ps -a --filter name=openhands-runtime- --format '{{.Names}} {{.Status}} {{.Image}}' || true
      for rc in $(docker ps -aq --filter name=openhands-runtime-); do
        echo "== Logs $rc =="
        docker logs --tail 120 "$rc" 2>&1 | tail -120 || true
      done
      echo "== OpenHands-App-Logs =="
      docker logs --tail 120 "$APP_CONTAINER" 2>&1 | tail -120
      exit 1
      ;;
  esac
  sleep 5
done

echo "Timeout ohne Ergebnisdatei"
docker ps -a --filter name=openhands-runtime --format '{{.Names}} {{.Status}}' || true
docker logs --tail 120 "$APP_CONTAINER" 2>&1 | tail -120
exit 1

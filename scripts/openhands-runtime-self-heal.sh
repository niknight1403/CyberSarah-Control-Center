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

echo "Docker-Speicher fuer die Runtime vorbereiten ..."
docker ps -aq --filter name=openhands-runtime- | xargs -r docker rm -f >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -af >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
journalctl --vacuum-size=100M >/dev/null 2>&1 || true
rm -rf /root/.npm/_cacache /root/.cache/pip /tmp/openhands-* /tmp/bx 2>/dev/null || true
rm -f /usr/share/ollama/.ollama/models/blobs/*-partial 2>/dev/null || true

FREE_KB="$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')"
echo "Freier Docker-Speicher nach Cleanup: $((FREE_KB / 1024)) MB"

# 38-GB-Host: das 7B-Modell belegt ~4.7 GB. Fuer Local-First-Routine reicht
# 1.5B; komplexe Aufgaben bleiben auf der bereits vorhandenen Free-Cloud-Kaskade.
if [ "$FREE_KB" -lt 7340032 ] && command -v ollama >/dev/null 2>&1; then
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

if [ "$FREE_KB" -lt 7340032 ]; then
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

echo "Passendes OpenHands-0.28-Runtime-Image vorladen ..."
docker pull "$RUNTIME_IMAGE" >/dev/null

# Kein zweites lokales Modell auf dem 38-GB-Host nachladen: die vorhandene
# Remote-Ollama/Free-Cloud-Kaskade liefert das LLM, die Runtime bleibt lokal.
rm -f /usr/share/ollama/.ollama/models/blobs/*-partial 2>/dev/null || true
python3 - "$COMPOSE" "$RUNTIME_IMAGE" <<'PY'
from pathlib import Path
import re, sys
path = Path(sys.argv[1])
image = sys.argv[2]
text = path.read_text()
entry = f"      - SANDBOX_RUNTIME_CONTAINER_IMAGE={image}"
pattern = r"(?m)^\s*-\s*SANDBOX_RUNTIME_CONTAINER_IMAGE=.*$"
if re.search(pattern, text):
    text = re.sub(pattern, entry, text, count=1)
else:
    marker = "    environment:\n"
    if marker not in text:
        raise SystemExit("environment-Block im OpenHands-Service fehlt")
    text = text.replace(marker, marker + entry + "\n", 1)
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
  STATUS="$(curl -fsS --max-time 10 "$BASE/api/conversations/$CID" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo '?')"
  case "$STATUS" in
    STOPPED|ERROR|stopped|error)
      echo "Agent stoppte vor erfolgreichem Dateibeweis: $STATUS"
      docker logs --tail 100 "$APP_CONTAINER" 2>&1 | tail -100
      exit 1
      ;;
  esac
  sleep 5
done

echo "Timeout ohne Ergebnisdatei"
docker ps -a --filter name=openhands-runtime --format '{{.Names}} {{.Status}}' || true
docker logs --tail 120 "$APP_CONTAINER" 2>&1 | tail -120
exit 1

#!/usr/bin/env bash
# Schliesst oeffentlich erreichbare Ports.
#   --inspect  : zeigt, wie die Container gestartet wurden (read-only)
#   --ufw      : entfernt die toten ufw-Regeln 3389/8888/8081 und 12000
set -uo pipefail

if [ "${1:-}" = "--inspect" ]; then
  for c in deploy-villa-1 openhands-autonomous-app; do
    echo "== $c =="
    docker inspect -f 'Image: {{.Config.Image}}
Compose-Projekt: {{index .Config.Labels "com.docker.compose.project"}}
Compose-Service: {{index .Config.Labels "com.docker.compose.service"}}
Compose-Datei: {{index .Config.Labels "com.docker.compose.project.config_files"}}
Ports: {{json .HostConfig.PortBindings}}' "$c" 2>/dev/null || echo "  Container nicht gefunden"
    echo "Mounts:"
    docker inspect -f '{{range .Mounts}}  {{.Type}} {{.Source}} -> {{.Destination}}
{{end}}' "$c" 2>/dev/null
    echo "Env-Variablen: $(docker inspect -f '{{len .Config.Env}}' "$c" 2>/dev/null)"
    echo "Restart-Policy: $(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)"
  done
  exit 0
fi

if [ "${1:-}" = "--ufw" ]; then
  echo "== Vorher =="
  ufw status numbered | grep -E "3389|8888|8081|12000" || echo "keine passenden Regeln"
  for rule in "3389/tcp" "8888/tcp" "8081/tcp" "12000/tcp"; do
    while ufw status | grep -qE "^${rule%/*}/tcp"; do
      yes | ufw delete allow "$rule" > /dev/null 2>&1 || break
    done
    echo "$rule entfernt"
  done
  echo "== Nachher =="
  ufw status numbered
  echo "== Erreichbarkeit von aussen folgt im Runner-Teil =="
  exit 0
fi

if [ "${1:-}" = "--deny-3000" ]; then
  # Explizite Sperre fuer die App: sie soll ausschliesslich ueber Caddy (443)
  # erreichbar sein, nicht ueber den Node-Port direkt.
  if ufw status | grep -qE "^3000/tcp"; then
    echo "Regel fuer 3000 existiert bereits:"
    ufw status | grep -E "^3000/tcp"
  else
    yes | ufw deny 3000/tcp > /dev/null 2>&1 && echo "ufw deny 3000/tcp gesetzt"
  fi
  echo "== Regeln jetzt =="
  ufw status numbered
  exit 0
fi

echo "Aufruf: ports-lockdown.sh --inspect | --ufw | --deny-3000"

#!/usr/bin/env bash
set -Eeuo pipefail

# CyberSarah Control Center — sichere production.env-Übertragung und Neustart
#
# Beispiel:
#   ./scripts/deploy-production-env.sh \
#     --key ~/.ssh/cybersarah-production \
#     --host 167.233.196.20 \
#     --env ~/production.env
#
# Optional:
#   --user root
#   --remote-dir /opt/cybersarah-control-center
#   --health-url https://app.cybersarah-ki.com

SSH_KEY=""
SSH_HOST=""
SSH_USER="root"
LOCAL_ENV=""
REMOTE_DIR="/opt/cybersarah-control-center"
HEALTH_URL="https://app.cybersarah-ki.com"

usage() {
  sed -n '1,38p' "$0"
  cat <<'EOF'

Optionen:
  --key PATH          Privater SSH-Key (erforderlich)
  --host HOST         Server-IP oder SSH-Hostname (erforderlich)
  --env PATH          lokale production.env (erforderlich)
  --user USER         SSH-Benutzer, Standard: root
  --remote-dir PATH   Projektverzeichnis, Standard: /opt/cybersarah-control-center
  --health-url URL    öffentliche Health-URL, Standard: https://app.cybersarah-ki.com
  -h, --help          Hilfe anzeigen
EOF
}

while (($#)); do
  case "$1" in
    --key) SSH_KEY=${2:?Fehlender Wert für --key}; shift 2 ;;
    --host) SSH_HOST=${2:?Fehlender Wert für --host}; shift 2 ;;
    --env) LOCAL_ENV=${2:?Fehlender Wert für --env}; shift 2 ;;
    --user) SSH_USER=${2:?Fehlender Wert für --user}; shift 2 ;;
    --remote-dir) REMOTE_DIR=${2:?Fehlender Wert für --remote-dir}; shift 2 ;;
    --health-url) HEALTH_URL=${2:?Fehlender Wert für --health-url}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

require_value() {
  if [[ -z "$2" ]]; then
    echo "$1 ist erforderlich." >&2
    usage >&2
    exit 2
  fi
}

require_value "--key" "$SSH_KEY"
require_value "--host" "$SSH_HOST"
require_value "--env" "$LOCAL_ENV"

if [[ ! -f "$SSH_KEY" ]]; then echo "SSH-Key nicht gefunden: $SSH_KEY" >&2; exit 1; fi
if [[ ! -f "$LOCAL_ENV" ]]; then echo "production.env nicht gefunden: $LOCAL_ENV" >&2; exit 1; fi
if [[ "$(stat -c '%a' "$LOCAL_ENV")" != "600" ]]; then
  echo "Unsichere Dateirechte für $LOCAL_ENV — erwartet wird 600." >&2
  exit 1
fi

# Keine Werte ausgeben: nur Schlüssel und Struktur prüfen.
if ! awk '
  /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
    key=$0; sub(/^[[:space:]]*/, "", key); sub(/[[:space:]]*=.*/, "", key)
    count[key]++
  }
  END {
    bad=0
    for (key in count) if (count[key] > 1) { print key ": doppelt" > "/dev/stderr"; bad=1 }
    exit bad
  }
' "$LOCAL_ENV"; then
  echo "Abbruch: production.env enthält doppelte Schlüssel." >&2
  exit 1
fi

for required in DATABASE_URL JWT_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  if ! grep -Eq "^[[:space:]]*${required}[[:space:]]*=[^[:space:]]" "$LOCAL_ENV"; then
    echo "Abbruch: Pflichtvariable fehlt: $required" >&2
    exit 1
  fi
done

chmod 600 "$SSH_KEY"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
REMOTE_TMP="/tmp/cybersarah-production.env.$$"

cleanup_remote() {
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "rm -f -- '$REMOTE_TMP'" >/dev/null 2>&1 || true
}
trap cleanup_remote EXIT

echo "[1/5] SSH-Verbindung wird geprüft …"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "test -d '$REMOTE_DIR' && test -w '$REMOTE_DIR'" \
  || { echo "SSH oder Projektverzeichnis nicht erreichbar: $SSH_USER@$SSH_HOST:$REMOTE_DIR" >&2; exit 1; }

echo "[2/5] production.env wird verschlüsselt per SCP nach /tmp übertragen …"
scp "${SSH_OPTS[@]}" "$LOCAL_ENV" "$SSH_USER@$SSH_HOST:$REMOTE_TMP"

echo "[3/5] Backup, sichere Installation und Serverprüfung …"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" bash -s -- "$REMOTE_DIR" "$REMOTE_TMP" <<'REMOTE_SCRIPT'
set -Eeuo pipefail
REMOTE_DIR=$1
REMOTE_TMP=$2
cd "$REMOTE_DIR"

backup=".env.backup.$(date +%Y%m%d-%H%M%S)"
if [ -f .env ]; then
  cp -p .env "$backup"
  chmod 600 "$backup"
fi

install -o "$(id -u)" -g "$(id -g)" -m 600 "$REMOTE_TMP" "$REMOTE_DIR/.env"
rm -f "$REMOTE_TMP"

if awk '
  /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
    key=$0; sub(/^[[:space:]]*/, "", key); sub(/[[:space:]]*=.*/, "", key)
    count[key]++
  }
  END {
    bad=0
    for (key in count) if (count[key] > 1) { print key ": doppelt" > "/dev/stderr"; bad=1 }
    exit bad
  }
' .env; then :; else
  echo "Remote-Abbruch: .env enthält doppelte Schlüssel." >&2
  exit 1
fi

for required in DATABASE_URL JWT_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  grep -Eq "^[[:space:]]*${required}[[:space:]]*=[^[:space:]]" .env || {
    echo "Remote-Abbruch: Pflichtvariable fehlt: $required" >&2
    exit 1
  }
done

stat -c 'REMOTE_ENV mode=%a owner=%U:%G' .env
npm run build
pm2 restart cybersarah-backend --update-env
pm2 save
REMOTE_SCRIPT

echo "[4/5] PM2-Prozessstatus wird geprüft …"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "pm2 describe cybersarah-backend --no-color | grep -E 'status|pid|restarts' || true"

echo "[5/5] Öffentliche Health- und Readiness-Checks …"
curl --fail --silent --show-error --max-time 15 "$HEALTH_URL/api/health" >/dev/null
curl --fail --silent --show-error --max-time 15 "$HEALTH_URL/api/ready" >/dev/null

echo "DEPLOYMENT_SUCCESS: Env installiert, Build erfolgreich, PM2 online, Health und Readiness grün."

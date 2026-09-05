#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/cybersarah-control-center"
ENV_FILE="$REPO_DIR/.env"
SERVICE_USER="${CYBERSARAH_SERVICE_USER:-cybersarah}"
SERVICE_GROUP="${CYBERSARAH_SERVICE_GROUP:-$SERVICE_USER}"
umask 077

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Dieses Skript muss als root ausgeführt werden (sudo -i)." >&2
  exit 1
fi

id "$SERVICE_USER" >/dev/null 2>&1 || {
  echo "Der Service-Benutzer '$SERVICE_USER' existiert nicht." >&2
  exit 1
}
getent group "$SERVICE_GROUP" >/dev/null || {
  echo "Die Service-Gruppe '$SERVICE_GROUP' existiert nicht." >&2
  exit 1
}

mkdir -p "$REPO_DIR"
if [[ -f "$ENV_FILE" ]]; then
  backup="$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
  cp -p "$ENV_FILE" "$backup"
  chmod 600 "$backup"
  echo "Vorhandene .env gesichert: $backup"
fi

ask_required() {
  local label="$1" value
  while [[ -z "$value" ]]; do
    read -r -p "$label: " value
    if [[ -z "$value" ]]; then echo "Wert erforderlich." >&2; fi
  done
  printf '%s' "$value"
}

ask_secret() {
  local label="$1" value
  while [[ -z "$value" ]]; do
    read -r -s -p "$label: " value
    printf '\n' >&2
    if [[ -z "$value" ]]; then echo "Wert erforderlich." >&2; fi
  done
  printf '%s' "$value"
}

app_base_url="$(ask_required 'APP_BASE_URL (z.B. https://app.cybersarah-ki.com)')"
[[ "$app_base_url" == https://* ]] || { echo "APP_BASE_URL muss mit https:// beginnen." >&2; exit 1; }

database_url="$(ask_secret 'DATABASE_URL')"
jwt_secret="$(ask_secret 'JWT_SECRET (mindestens 32 Zeichen)')"
[[ "${#jwt_secret}" -ge 32 ]] || { echo "JWT_SECRET muss mindestens 32 Zeichen lang sein." >&2; exit 1; }

stripe_secret="$(ask_secret 'STRIPE_SECRET_KEY (sk_live_...)')"
[[ "$stripe_secret" == sk_live_* ]] || { echo "Es wird ein Stripe-Live-Key mit sk_live_ erwartet." >&2; exit 1; }
stripe_price="$(ask_required 'STRIPE_PRICE_ID (price_...)')"
[[ "$stripe_price" == price_* ]] || { echo "STRIPE_PRICE_ID muss mit price_ beginnen." >&2; exit 1; }
stripe_webhook="$(ask_secret 'STRIPE_WEBHOOK_SECRET (whsec_...)')"
[[ "$stripe_webhook" == whsec_* ]] || { echo "STRIPE_WEBHOOK_SECRET muss mit whsec_ beginnen." >&2; exit 1; }

service_token="$(ask_secret 'SERVICE_ACCESS_TOKEN')"
metrics_token="$(ask_secret 'METRICS_TOKEN')"
forge_url="${BUILT_IN_FORGE_API_URL:-}"
forge_key="${BUILT_IN_FORGE_API_KEY:-}"
read -r -p "BUILT_IN_FORGE_API_URL (optional): " forge_url_input
read -r -s -p "BUILT_IN_FORGE_API_KEY (optional): " forge_key_input
printf '\n' >&2
[[ -n "$forge_url_input" ]] && forge_url="$forge_url_input"
[[ -n "$forge_key_input" ]] && forge_key="$forge_key_input"

cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${PORT:-3000}
APP_BASE_URL=$app_base_url
DATABASE_URL=$database_url
JWT_SECRET=$jwt_secret

STRIPE_MODE=live
STRIPE_SECRET_KEY=$stripe_secret
STRIPE_PRICE_ID=$stripe_price
STRIPE_WEBHOOK_SECRET=$stripe_webhook

SERVICE_ACCESS_TOKEN=$service_token
METRICS_TOKEN=$metrics_token
BUILT_IN_FORGE_API_URL=$forge_url
BUILT_IN_FORGE_API_KEY=$forge_key
EOF

chmod 600 "$ENV_FILE"
chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"

echo ".env wurde sicher geschrieben: $ENV_FILE"
echo "Eigentümer: $SERVICE_USER:$SERVICE_GROUP, Modus: 600"
echo "Secrets werden nicht ausgegeben. Als Nächstes ausführen:"
echo "  cd $REPO_DIR"
echo "  git pull --ff-only origin main"
echo "  pnpm install --frozen-lockfile"
echo "  pnpm run build"
echo "  systemctl restart cybersarah.service"

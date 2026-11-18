#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [[ -e .env ]]; then
  echo ".env exists; refusing to overwrite." >&2
  exit 1
fi
cp .env.example .env
secret() { openssl rand -hex "$1"; }
replace() {
  local key="$1" value="$2"
  sed -i "s|^${key}=.*|${key}=${value}|" .env
}
replace GRAFANA_ADMIN_PASSWORD "$(secret 24)"
replace METRICS_TOKEN "$(secret 32)"
replace FARO_INGEST_KEY "$(secret 24)"
chmod 600 .env
echo "Created .env with unique local secrets."
echo "Copy the METRICS_TOKEN value from .env into the CyberSarah application environment."
echo "Set APP_PUBLIC_ORIGIN to the exact browser origin before exposing Faro RUM."

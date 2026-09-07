#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="${1:-}"
TARGET_FILE="${REPO_DIR}/.secrets/google-play-service-account.json"

if [[ -z "$SOURCE_FILE" ]]; then
  echo "Verwendung: $0 /sicherer/pfad/neuer-service-account-key.json" >&2
  exit 2
fi
if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Credential-Datei nicht gefunden: $SOURCE_FILE" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq wird zur strukturellen Validierung benötigt." >&2
  exit 1
fi

if ! jq -e '
  .type == "service_account" and
  (.client_email | type == "string" and length > 0) and
  (.private_key | type == "string" and startswith("-----BEGIN PRIVATE KEY-----"))
' "$SOURCE_FILE" >/dev/null; then
  echo "Die Datei ist kein gültiger Google-Service-Account-Key." >&2
  exit 1
fi

umask 077
install -d -m 700 "$(dirname -- "$TARGET_FILE")"
install -m 600 "$SOURCE_FILE" "$TARGET_FILE"

if ! cmp -s "$SOURCE_FILE" "$TARGET_FILE"; then
  echo "Credential-Import konnte nicht verifiziert werden." >&2
  exit 1
fi

printf 'Credential-Datei sicher installiert: %s\n' "$TARGET_FILE"
printf '%s\n' 'Werte wurden nicht ausgegeben. Prüfe vor eas submit zusätzlich die EAS-Projektberechtigungen.'

#!/usr/bin/env bash
set -Eeuo pipefail

# Optionaler Pfad zur geschützten Konfiguration. Die Datei darf keine Secrets
# im Git-Repository enthalten und sollte auf dem Server root-only sein.
ENV_FILE="${ENV_FILE:-/etc/cybersarah/disk-alert.env}"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

: "${NTFY_URL:?NTFY_URL fehlt in ${ENV_FILE}; z. B. https://ntfy.sh/dein-langes-topic}"

WARN_PERCENT="${WARN_PERCENT:-85}"
CRITICAL_PERCENT="${CRITICAL_PERCENT:-90}"
MOUNTPOINT="${MOUNTPOINT:-/}"
STATE_DIR="${STATE_DIR:-/var/lib/cybersarah}"
STATE_FILE="${STATE_FILE:-${STATE_DIR}/disk-alert.state}"
HOSTNAME_VALUE="$(hostname --fqdn 2>/dev/null || hostname)"

usage="$(df -P "$MOUNTPOINT" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
used="$(df -hP "$MOUNTPOINT" | awk 'NR==2 {print $3}')"
avail="$(df -hP "$MOUNTPOINT" | awk 'NR==2 {print $4}')"

if [[ ! "$usage" =~ ^[0-9]+$ ]]; then
    logger -t cybersarah-disk "FEHLER: Füllstand für $MOUNTPOINT konnte nicht gelesen werden"
    exit 2
fi

if (( usage >= CRITICAL_PERCENT )); then
    level="critical"
    priority="urgent"
    tags="rot,warning"
    title="CyberSarah: kritischer Speicherplatz"
elif (( usage >= WARN_PERCENT )); then
    level="warning"
    priority="high"
    tags="warning"
    title="CyberSarah: Speicherplatz knapp"
else
    level="ok"
    priority="low"
    tags="white_check_mark"
    title="CyberSarah: Speicherplatz wieder normal"
fi

previous="unknown"
if [[ -r "$STATE_FILE" ]]; then
    previous="$(cat "$STATE_FILE")"
fi

logger -t cybersarah-disk "Status: $level; $MOUNTPOINT ist zu ${usage}% belegt; frei: ${avail}"

# Nur bei Zustandswechsel benachrichtigen, damit der Dienst nicht bei jedem
# Timer-Lauf dieselbe Meldung sendet.
if [[ "$level" == "$previous" ]]; then
    exit 0
fi

mkdir -p "$STATE_DIR"
printf '%s\n' "$level" > "$STATE_FILE"
chmod 0640 "$STATE_FILE"

message="Host: ${HOSTNAME_VALUE}
Mountpoint: ${MOUNTPOINT}
Belegt: ${usage}% (${used})
Frei: ${avail}
Schwellen: Warnung ab ${WARN_PERCENT}%, kritisch ab ${CRITICAL_PERCENT}%"

curl_args=(
    --fail
    --silent
    --show-error
    --max-time 15
    -X POST
    -H "Title: ${title}"
    -H "Priority: ${priority}"
    -H "Tags: ${tags}"
)
if [[ -n "${NTFY_TOKEN:-}" ]]; then
    curl_args+=(-H "Authorization: Bearer ${NTFY_TOKEN}")
fi

curl "${curl_args[@]}" --data-binary "$message" "$NTFY_URL"

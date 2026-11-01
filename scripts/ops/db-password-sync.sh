#!/usr/bin/env bash
# Synchronisiert das Passwort der DB-Rolle mit dem Wert aus der App-.env.
# Wird nur auf dem Server ausgefuehrt; gibt niemals das Passwort aus.
set -euo pipefail

ENVF="${ENVF:-/opt/cybersarah-control-center/.env}"
[ -f "$ENVF" ] || { echo "FEHLER: $ENVF fehlt"; exit 1; }

URL=$(grep -m1 '^DATABASE_URL=' "$ENVF" | cut -d= -f2- | tr -d '\r')
[ -n "${URL:-}" ] || { echo "FEHLER: keine DATABASE_URL in $ENVF"; exit 1; }

ROLE=$(node -e 'try{console.log(decodeURIComponent(new URL(process.argv[1]).username))}catch(e){console.log("")}' "$URL")
PW=$(node -e 'try{console.log(decodeURIComponent(new URL(process.argv[1]).password))}catch(e){console.log("")}' "$URL")

[ -n "$ROLE" ] || { echo "FEHLER: Rolle nicht lesbar"; exit 1; }
[ -n "$PW" ] || { echo "FEHLER: Passwort nicht lesbar"; exit 1; }

# Einfache Anfuehrungszeichen fuer SQL verdoppeln.
ESCAPED=$(printf '%s' "$PW" | sed "s/'/''/g")

echo "Rolle: $ROLE (Passwort ${#PW} Zeichen)"
printf "\\set pw '%s'\nALTER ROLE \"%s\" WITH PASSWORD :'pw';\n" "$ESCAPED" "$ROLE" | runuser -u postgres -- psql -q -v ON_ERROR_STOP=1
echo "Passwort synchronisiert."

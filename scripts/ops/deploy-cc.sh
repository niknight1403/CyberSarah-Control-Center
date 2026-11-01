#!/usr/bin/env bash
# ==============================================================================
# CCC Deploy Bootstrapper (sichere Fassung)
#
#   bash scripts/ops/deploy-cc.sh            # nur pruefen, nichts veraendern
#   bash scripts/ops/deploy-cc.sh --apply    # aktualisieren, bauen, migrieren, neu starten
#
# Bewusste Unterschiede zum Original-Bootstrapper:
#   - Secrets werden NICHT aus GitHub gelesen (gh secret view gibt es nicht;
#     Secrets sind write-only). Sie kommen ueber den Workflow in die .env.
#   - Keine ${VAR:-default}-Literale in der .env, keine Duplikat-Bereinigung,
#     die echte Werte ueberschreiben koennte.
#   - Kein "drizzle-kit push" (kann Spalten loeschen), nur "migrate".
#   - Kein "docker compose down": die App laeuft unter PM2, Compose gibt es hier nicht.
#   - Health ueber /api/ready (prueft die Datenbank), nicht nur /api/health.
# ==============================================================================
set -uo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cybersarah-control-center}"
APP_NAME="${APP_NAME:-cybersarah-control-center}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/ready}"
RETRIES="${RETRIES:-6}"
DELAY="${DELAY:-10}"

MODE="check"
case "${1:-}" in
  --apply) MODE="apply" ;;
  --check|"") MODE="check" ;;
  *) echo "Unbekannte Option: $1 (erlaubt: --check, --apply)"; exit 2 ;;
esac

ok()   { printf '[OK]     %s\n' "$1"; }
warn() { printf '[WARN]   %s\n' "$1"; }
fail() { printf '[FEHLER] %s\n' "$1"; }
info() { printf '[INFO]   %s\n' "$1"; }

cd "$DEPLOY_DIR" 2>/dev/null || { fail "Verzeichnis $DEPLOY_DIR fehlt"; exit 1; }

info "1/5 Umgebung pruefen (Werte werden nie ausgegeben)"
if [ ! -f .env ]; then
  fail ".env fehlt in $DEPLOY_DIR"
  exit 1
fi
# Werte ausschliesslich aus der Datei lesen: die Umgebung des Aufrufers
# (Workflow, interaktive Shell) darf das Ergebnis nicht verfaelschen.
env_value() {
  grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}

MISSING=0
presence() {
  local name="$1" required="$2" value
  value=$(env_value "$name")
  if [ -n "$value" ]; then
    ok "$name gesetzt (${#value} Zeichen)"
  elif [ "$required" = "ja" ]; then
    fail "$name fehlt (erforderlich)"
    MISSING=$((MISSING + 1))
  else
    warn "$name fehlt (optional, Funktion bleibt dunkel)"
  fi
}
presence DATABASE_URL ja
presence PORT nein
presence STRIPE_SECRET_KEY nein
presence STRIPE_WEBHOOK_SECRET nein
presence DIGISTORE24_API_KEY nein
presence HUBSPOT_SERVICE_KEY nein
presence REDIS_URL nein

if [ "$MISSING" -gt 0 ]; then
  fail "$MISSING Pflichtvariable(n) fehlen, Abbruch."
  exit 1
fi

info "2/5 Git-Stand"
if [ "$MODE" = "apply" ]; then
  if git fetch -q origin main && git pull --ff-only -q origin main; then
    ok "Code aktualisiert auf $(git rev-parse --short HEAD)"
  else
    warn "Pull nicht moeglich (lokale Aenderungen oder Konflikt), weiter mit $(git rev-parse --short HEAD)"
  fi
else
  HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unbekannt")
  COUNT=$(git rev-list --left-right --count HEAD...origin/main 2>/dev/null || echo "n/a")
  info "HEAD ${HEAD_SHA}, Abstand zu origin/main: ${COUNT}"
fi

info "3/5 Abhaengigkeiten und Build"
if [ "$MODE" = "apply" ]; then
  if npm ci --include=dev --no-audit --no-fund > /tmp/ccc-npm.log 2>&1; then
    ok "Abhaengigkeiten installiert"
  else
    fail "npm ci fehlgeschlagen, siehe /tmp/ccc-npm.log"; tail -5 /tmp/ccc-npm.log; exit 1
  fi
  if npm run build > /tmp/ccc-build.log 2>&1; then
    ok "Build erfolgreich"
  else
    fail "Build fehlgeschlagen, siehe /tmp/ccc-build.log"; tail -15 /tmp/ccc-build.log; exit 1
  fi
else
  info "uebersprungen (nur mit --apply)"
fi

info "4/5 Migrationen (nur vorwaerts)"
if [ "$MODE" = "apply" ]; then
  if ./node_modules/.bin/drizzle-kit migrate > /tmp/ccc-migrate.log 2>&1; then
    ok "Migrationen eingespielt"
  else
    fail "Migration fehlgeschlagen, siehe /tmp/ccc-migrate.log"; tail -10 /tmp/ccc-migrate.log; exit 1
  fi
  node scripts/ops/db-diag.mjs 2>&1 | head -4
else
  info "uebersprungen (nur mit --apply)"
fi

info "5/5 Health und Self-Healing"
health_code() {
  curl -s -o /tmp/ccc-health.json -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000"
}

CODE=$(health_code)
if [ "$CODE" = "200" ]; then
  ok "Health 200: $(head -c 200 /tmp/ccc-health.json)"
  exit 0
fi

warn "Health antwortet $CODE"
if [ "$MODE" != "apply" ]; then
  fail "Nicht gesund. Mit --apply wird neu gestartet."
  exit 1
fi

info "Self-Healing: App neu starten"
pm2 restart "$APP_NAME" --update-env > /dev/null 2>&1 && ok "PM2-Neustart ausgeloest" || fail "PM2-Neustart fehlgeschlagen"

for i in $(seq 1 "$RETRIES"); do
  sleep "$DELAY"
  CODE=$(health_code)
  if [ "$CODE" = "200" ]; then
    ok "Health 200 nach Neustart (Versuch $i)"
    exit 0
  fi
  warn "Versuch $i/$RETRIES weiterhin $CODE"
done

fail "App bleibt ungesund (HTTP $CODE)"
tail -12 "$HOME/.pm2/logs/${APP_NAME}-error.log" 2>/dev/null
exit 1

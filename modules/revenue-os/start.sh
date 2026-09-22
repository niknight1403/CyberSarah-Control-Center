#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "🚀 Starte CyberSarah Revenue OS..."

# ── .env laden ──────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a
  source .env
  set +a
  echo "✅ .env geladen"
else
  echo "⚠️ Keine .env-Datei gefunden — Umgebungsvariablen werden extern erwartet"
fi

# ── tsx installieren falls nötig ────────────────────────────────────────────────
if ! command -v tsx &> /dev/null; then
    echo "📥 Installiere tsx global..."
    npm install -g tsx 2>&1 | tail -3
fi

echo "✅ tsx: $(tsx --version)"

# ── API-Key Validierung ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     🔑 CyberSarah Revenue OS — API-Key Status      ║"
echo "╠══════════════════════════════════════════════════════╣"

check_key() {
  local name="$1" value="$2" prefix="$3"
  if [ -z "$value" ]; then
    echo "║  ❌ $name: NICHT GESETZT                            ║"
  elif [ -n "$prefix" ] && [[ "$value" == $prefix* ]]; then
    echo "║  ✅ $name: AKTIV (${value:0:12}...)               ║"
  else
    echo "║  ⚠️  $name: gesetzt (Prüfung beim Start)          ║"
  fi
}

check_key "STRIPE_SECRET_KEY"  "${STRIPE_SECRET_KEY:-}"  "sk_"
check_key "OPENAI_API_KEY"     "${OPENAI_API_KEY:-}"     "sk-"
check_key "GEMINI_API_KEY"     "${GEMINI_API_KEY:-}"     "AI"
check_key "DIGISTORE24_API_KEY" "${DIGISTORE24_API_KEY:-}" ""
check_key "STRIPE_WEBHOOK_SECRET" "${STRIPE_WEBHOOK_SECRET:-}" "whsec_"
check_key "TELEGRAM_BOT_TOKEN" "${TELEGRAM_BOT_TOKEN:-}" ""

check_key "DATABASE_URL" "${DATABASE_URL:-}" "postgres"

if [[ "${STRIPE_SECRET_KEY:-}" == sk_live_* ]]; then
  echo "║  💰 Stripe: LIVE-MODUS aktiv                       ║"
elif [[ "${STRIPE_SECRET_KEY:-}" == sk_test_* ]]; then
  echo "║  🧪 Stripe: TEST-MODUS (kein echtes Geld!)        ║"
fi

echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Server starten ──────────────────────────────────────────────────────────────
echo "📡 Starte Server auf Port ${PORT:-3000}..."
PORT="${PORT:-3000}" tsx artifacts/api-server/src/index.ts

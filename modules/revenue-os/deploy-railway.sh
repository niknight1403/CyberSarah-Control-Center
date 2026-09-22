#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — Railway Quick Deploy
# ═══════════════════════════════════════════════════════════════════
set -e

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
ok() { echo -e "${G}✅ $1${NC}"; }
warn() { echo -e "${Y}⚠️  $1${NC}"; }
err() { echo -e "${R}❌ $1${NC}"; }

echo -e "${G}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${G}║  CyberSarah Revenue OS — Railway Quick Deploy       ║${NC}"
echo -e "${G}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Railway CLI installieren ────────────────────────────────
if ! command -v railway &>/dev/null; then
    warn "Installiere Railway CLI..."
    curl -fsSL https://railway.app/install.sh | sh
    export PATH="$HOME/.railway/bin:$PATH"
fi

ok "Railway CLI: $(railway version 2>/dev/null || echo 'installiert')"

# ─── 2. Login ──────────────────────────────────────────────────
warn "Railway Login..."
railway login

# ─── 3. Projekt verknüpfen ─────────────────────────────────────
cd /opt/cybersarah 2>/dev/null || cd "$(pwd)"
warn "Verknüpfe Projekt mit Railway..."
railway link

# ─── 4. PostgreSQL Datenbank ────────────────────────────────────
warn "Erstelle PostgreSQL Datenbank..."
railway add --database postgresql

# ─── 5. Env Vars ───────────────────────────────────────────────
warn "Setze Umgebungsvariablen..."

# Aus .env lesen oder fragen
if [ -f .env ]; then
    # OpenAI Key
    OPENAI_KEY=$(grep "OPENAI_API_KEY=" .env | cut -d= -f2-)
    if [ -n "$OPENAI_KEY" ]; then
        railway variables set "OPENAI_API_KEY=$OPENAI_KEY"
    fi
    
    # Stripe Keys
    STRIPE_KEY=$(grep "STRIPE_SECRET_KEY=" .env | cut -d= -f2-)
    if [ -n "$STRIPE_KEY" ]; then
        railway variables set "STRIPE_SECRET_KEY=$STRIPE_KEY"
    fi
    
    STRIPE_WEBHOOK=$(grep "STRIPE_WEBHOOK_SECRET=" .env | cut -d= -f2-)
    if [ -n "$STRIPE_WEBHOOK" ]; then
        railway variables set "STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK"
    fi
fi

# Basis-Vars
railway variables set "PORT=3000"
railway variables set "NODE_ENV=production"

ok "Env Vars gesetzt"

# ─── 6. Deploy ─────────────────────────────────────────────────
warn "Deploye auf Railway..."
railway up --service "cybersarah-api"

# ─── 7. Domain ─────────────────────────────────────────────────
warn "Generiere öffentliche URL..."
railway domain

# ─── 8. Status ─────────────────────────────────────────────────
echo ""
ok "═══════════════════════════════════════════════════════"
ok "  Deploy abgeschlossen!"
ok "═══════════════════════════════════════════════════════"
echo ""
echo "  📊 Dashboard:  https://railway.app/project/..."
echo "  🌐 App URL:    https://cybersarah-api.up.railway.app"
echo "  📝 Blog:       https://cybersarah-api.up.railway.app/blog"
echo "  🗺️  Sitemap:    https://cybersarah-api.up.railway.app/sitemap.xml"
echo ""
echo "  📱 SOCIAL MEDIA KEYS EINTRAGEN:"
echo "  → railway variables set TIKTOK_ACCESS_TOKEN=..."
echo "  → railway variables set INSTAGRAM_ACCESS_TOKEN=..."
echo ""
echo "  🔍 GOOGLE SEARCH CONSOLE:"
echo "  → https://search.google.com/search-console"
echo "  → Property: cybersarah-api.up.railway.app"
echo ""

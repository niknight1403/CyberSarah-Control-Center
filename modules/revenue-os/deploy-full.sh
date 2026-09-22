#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — VOLLSTÄNDIGES DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════
# Führe dieses Skript im Hetzner Cloud Console Web-Terminal aus:
# console.hetzner.cloud → Server auswählen → "Konsole"
# ═══════════════════════════════════════════════════════════════════════════
set -e

G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; R='\033[0;31m'; NC='\033[0m'
ok()  { echo -e "${G}✅ $1${NC}"; }
warn(){ echo -e "${Y}⚠️  $1${NC}"; }
info(){ echo -e "${C}ℹ️  $1${NC}"; }
err() { echo -e "${R}❌ $1${NC}"; }

echo -e "${G}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${G}║  🚀 CyberSarah Revenue OS — Vollständiges Deployment      ║${NC}"
echo -e "${G}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

WORKDIR="/opt/cybersarah"

# ─── 1. System-Updates ────────────────────────────────────────
info "1/9 System-Updates..."
sudo apt-get update -qq && sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq curl git build-essential nginx
ok "System-Updates installiert"

# ─── 2. Node.js 20+ ──────────────────────────────────────────
info "2/9 Node.js..."
if ! command -v node &>/dev/null || [ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
fi
ok "Node.js $(node --version)"

# ─── 3. pnpm ──────────────────────────────────────────────────
info "3/9 pnpm..."
command -v pnpm &>/dev/null || sudo npm install -g pnpm
ok "pnpm $(pnpm --version)"

# ─── 4. Repository ────────────────────────────────────────────
info "4/9 Repository..."
if [ -d "$WORKDIR/.git" ]; then
    cd "$WORKDIR" && git pull origin main
else
    sudo mkdir -p /opt
    sudo git clone https://github.com/niknight1403/cybersarah-revenue-os.git "$WORKDIR"
    sudo chown -R $(whoami) "$WORKDIR"
fi
cd "$WORKDIR"
ok "Code bereit: $(pwd)"

# ─── 5. Dependencies ──────────────────────────────────────────
info "5/9 Dependencies..."
pnpm install
ok "Dependencies installiert"

# ─── 6. .env synchronisieren ──────────────────────────────────
info "6/9 .env prüfen..."
if [ ! -f "$WORKDIR/.env" ]; then
    cp "$WORKDIR/.env.example" "$WORKDIR/.env"
    warn ".env aus Template erstellt — JETZT ECHTE KEYS EINTRAGEN!"
    warn "    nano $WORKDIR/.env"
    warn "    Dann Skript erneut ausführen!"
    exit 1
fi
# .env in api-server kopieren
cp "$WORKDIR/.env" "$WORKDIR/artifacts/api-server/.env"
ok ".env bereit → api-server/.env synchronisiert"

# ─── 7. Dashboard bauen (KRITISCH — fehlte vorher!) ───────────
info "7/9 Dashboard bauen..."
cd "$WORKDIR/artifacts/dashboard"
pnpm install 2>/dev/null || true
pnpm run build
ok "Dashboard gebaut: $(ls -la dist/ 2>/dev/null | wc -l) Dateien"

# ─── 8. Nginx ─────────────────────────────────────────────────
info "8/9 Nginx..."
sudo tee /etc/nginx/sites-available/cybersarah > /dev/null << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/cybersarah /etc/nginx/sites-enabled/cybersarah
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
ok "Nginx Port 80 → localhost:3000"

# ─── 9. PM2 Server starten ────────────────────────────────────
info "9/9 Server starten..."
command -v pm2 &>/dev/null || sudo npm install -g pm2
cd "$WORKDIR/artifacts/api-server"
pm2 delete cybersarah 2>/dev/null || true
pm2 start "node --import tsx src/index.ts" --name cybersarah --max-memory-restart 512M --time
pm2 save && pm2 startup 2>/dev/null || true
ok "Server gestartet mit PM2"

sleep 5
curl -s http://localhost:3000/ > /dev/null 2>&1 && ok "Server erreichbar!" || warn "Server startet noch..."

echo ""
echo -e "${G}══════════════════════════════════════════════════════════${NC}"
echo -e "${G}  🚀 DEPLOYMENT FERTIG!                                  ${NC}"
echo -e "${G}══════════════════════════════════════════════════════════${NC}"
echo -e "  🌐 http://167.233.196.20"
echo -e "  📊 /api/master-agent"
echo -e "  💰 /api/hara/overview"
echo -e "  📡 /api/stripe/webhook"
echo -e "  📋 pm2 logs cybersarah"
echo -e ""
echo -e "  ⚠️  STRIPE_WEBHOOK_SECRET eintragen:"
echo -e "     nano $WORKDIR/.env"
echo -e "  ⚠️  Danach neu deployen oder: pm2 restart cybersarah"

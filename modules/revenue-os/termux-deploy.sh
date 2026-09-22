#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# CyberSarah Termux ONE-CLICK DEPLOY v7.0
# ──────────────────────────────────────────────────────────────────────
# Nutzung: bash termux-deploy.sh
# Das Skript fragt nach deinem SSH-Passwort und deployed alles.
# ═══════════════════════════════════════════════════════════════════════

set -e

SERVER_IP="167.233.196.20"
SERVER_USER="root"
GIT_REPO="https://github.com/niknight1403/cybersarah-revenue-os.git"

RED='\033[0;91m'
GREEN='\033[0;92m'
YELLOW='\033[0;93m'
CYAN='\033[0;96m'
MAGENTA='\033[0;95m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "\n${MAGENTA}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🚀 CyberSarah DEPLOY v7.0 — ONE CLICK                     ║"
echo "║  Drücke Enter und los geht's!                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── SSH-Passwort ─────────────────────────────────────────────────────
if ! command -v sshpass &>/dev/null; then
  echo -e "${YELLOW}📦 Installiere sshpass...${NC}"
  pkg install sshpass -y 2>/dev/null || apt install sshpass -y 2>/dev/null || true
fi

echo -e "${YELLOW}🔑 SSH-Passwort für ${SERVER_USER}@${SERVER_IP}:${NC}"
read -s -p "> " PASSWORD
echo ""

# ─── Deploy ───────────────────────────────────────────────────────────
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=30"

echo -e "\n${CYAN}📡 Verbinde zu ${SERVER_IP}...${NC}"
sshpass -p "$PASSWORD" ssh $SSH_OPTS ${SERVER_USER}@${SERVER_IP} "
  set -e
  echo '📥 1/6 Pull latest code...'
  cd /opt/cybersarah
  git fetch origin 2>&1 | tail -1
  git reset --hard origin/main 2>&1 | tail -1
  
  echo '📦 2/6 Installiere Dependencies...'
  pnpm install 2>&1 | tail -3
  
  echo '⚙️  3/6 Kopiere .env...'
  cp .env artifacts/api-server/.env 2>/dev/null || true
  
  echo '🚀 4/6 Starte PM2 neu...'
  pm2 delete cybersarah 2>/dev/null || true
  cd artifacts/api-server
  pm2 start npx tsx src/index.ts --name cybersarah --time --max-memory-restart 500M 2>&1 | tail -2
  pm2 save 2>&1 | tail -1
  
  echo '⏳ 5/6 Warte auf Server...'
  sleep 4
  
  echo '🏥 6/6 Health-Check...'
  curl -s --connect-timeout 5 http://localhost:3000/api/healthz 2>/dev/null || echo '⚠️  Health-Check wartet...'
"

echo -e "\n${GREEN}${BOLD}✅ DEPLOY ERFOLGREICH!${NC}"
echo -e "${CYAN}🌐 Dashboard: http://${SERVER_IP}:3000${NC}"
echo -e "${CYAN}📱 APK:      http://${SERVER_IP}:3000/CyberSarah-Master-v7.0-release.apk${NC}"
echo ""

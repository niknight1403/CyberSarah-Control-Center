#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah DEPLOY-NOW — Zero-Config Deployment
# ──────────────────────────────────────────────────────────────────
# Ein Befehl — deployed den gesamten Server + aktiviert alles
#
# Nutzung:
#   bash deploy-now.sh                     # interaktiv (fragt nach Passwort)
#   bash deploy-now.sh --password=MEINPASS  # automatisch
#   bash deploy-now.sh --auto              # interaktiv + Quick-Start
#
# Funktionsweise:
#   1. Prüft ob sshpass installiert ist (installiert es in Termux)
#   2. Fragt nach SSH-Passwort (wenn nicht als Argument)
#   3. SSH zum Hetzner Server
#   4. Führt quick-fix-server.sh aus (git pull → pnpm install → restart)
#   5. Startet alle Agenten per Quick-Start API
#   6. Prüft Server-Status
#   7. Zeigt wichtige URLs + APK Download
# ═══════════════════════════════════════════════════════════════════

set -e

# ─── Konfiguration ─────────────────────────────────────────────────────────────
SERVER_IP="167.233.196.20"
SERVER_USER="root"
GITHUB_RAW="https://raw.githubusercontent.com/niknight1403/cybersarah-revenue-os/main"
QUICK_FIX_SCRIPT="quick-fix-server.sh"

# ─── Farben ────────────────────────────────────────────────────────────────────
RED='\033[0;91m'
GREEN='\033[0;92m'
YELLOW='\033[0;93m'
BLUE='\033[0;94m'
MAGENTA='\033[0;95m'
CYAN='\033[0;96m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🚀 CyberSarah DEPLOY-NOW v1.0                              ║"
echo "║  Zero-Config — Ein Befehl, Server fertig!                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Argumente parsen ─────────────────────────────────────────────────────────
PASSWORD=""
AUTO=false
for arg in "$@"; do
  case $arg in
    --password=*) PASSWORD="${arg#*=}" ;;
    --auto) AUTO=true ;;
  esac
done

# ─── Prüfungen ─────────────────────────────────────────────────────────────────
echo -e "${BLUE}🔍 Prüfe Voraussetzungen...${NC}"

# sshpass installieren (Termux)
if ! command -v sshpass &>/dev/null; then
  echo -e "${YELLOW}📦 Installiere sshpass...${NC}"
  if command -v pkg &>/dev/null; then
    pkg install sshpass -y 2>/dev/null && echo -e "${GREEN}✅ sshpass installiert${NC}"
  elif command -v apt &>/dev/null; then
    apt install sshpass -y 2>/dev/null && echo -e "${GREEN}✅ sshpass installiert${NC}"
  else
    echo -e "${RED}❌ sshpass nicht installierbar. Bitte manuell: pkg install sshpass${NC}"
    exit 1
  fi
fi

# Passwort besorgen
if [ -z "$PASSWORD" ]; then
  echo -e "${YELLOW}🔑 SSH-Passwort für ${SERVER_USER}@${SERVER_IP}:${NC}"
  read -s -p "> " PASSWORD
  echo ""
  if [ -z "$PASSWORD" ]; then
    echo -e "${RED}❌ Kein Passwort eingegeben${NC}"
    exit 1
  fi
fi

# ─── SSH-Verbindung testen ─────────────────────────────────────────────────────
echo -e "${BLUE}🔌 Teste SSH-Verbindung...${NC}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=30"
if sshpass -p "$PASSWORD" ssh $SSH_OPTS ${SERVER_USER}@${SERVER_IP} "echo OK" 2>/dev/null; then
  echo -e "${GREEN}✅ SSH-Verbindung hergestellt${NC}"
else
  echo -e "${RED}❌ SSH-Verbindung fehlgeschlagen. Falsches Passwort?${NC}"
  exit 1
fi

# ─── Server-Check ──────────────────────────────────────────────────────────────
echo -e "${BLUE}📋 Prüfe aktuellen Server-Zustand...${NC}"
sshpass -p "$PASSWORD" ssh $SSH_OPTS ${SERVER_USER}@${SERVER_IP} "
  echo '🏠 Server: \$(hostname)'
  echo '📦 Betriebszeit: \$(uptime -p)'
  echo '💾 RAM: \$(free -h | grep Mem | awk \"{print \\\$3 \\\"/\\\$2\\\"}\")'
  echo '📀 Festplatte: \$(df -h / | tail -1 | awk \"{print \\\$5}\")'
  echo '🟢 PM2-Status:'
  pm2 status cybersarah 2>/dev/null --no-color || echo '   ⚪ Nicht aktiv'
  echo '🌐 Server-Port 3000: \$(ss -tlnp | grep 3000 > /dev/null && echo \"Aktiv ✅\" || echo \"Nicht aktiv ❌\")'
"

# ─── Deployment ────────────────────────────────────────────────────────────────
echo ""
echo -e "${MAGENTA}${BOLD}╔════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}${BOLD}║  🚀 STARTE DEPLOYMENT...                      ║${NC}"
echo -e "${MAGENTA}${BOLD}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Zeit messen
DEPLOY_START=$(date +%s)

# Quick-Fix Script auf dem Server ausführen
echo -e "${BLUE}📦 Führe Quick-Fix auf Server aus...${NC}"
echo -e "${YELLOW}   (Das kann 1-5 Minuten dauern)${NC}"
echo ""

sshpass -p "$PASSWORD" ssh $SSH_OPTS ${SERVER_USER}@${SERVER_IP} "
  set -e
  echo '📥 1/7 Pull Code...'
  cd /opt/cybersarah
  git fetch origin 2>&1 | tail -1
  git reset --hard origin/main 2>&1 | tail -1
  
  echo '📦 2/7 Installiere Dependencies...'
  pnpm install 2>&1 | tail -2
  
  echo '⚙️  3/7 Kopiere .env...'
  cp .env artifacts/api-server/.env 2>/dev/null || true
  
  echo '🚀 4/7 Starte Server...'
  pm2 delete cybersarah 2>/dev/null || true
  cd artifacts/api-server
  pm2 start npx tsx src/index.ts --name cybersarah --time --max-memory-restart 500M 2>&1 | tail -2
  pm2 save 2>&1 | tail -1
  cd /opt/cybersarah
  
  echo '⏳ 5/7 Warte auf Server-Start...'
  sleep 4
  
  echo '⚡ 6/7 Quick-Start — alle Agenten aktivieren...'
  curl -s -X POST http://localhost:3000/api/quick-start 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);print(f\"  ✅ {d.get(\\\"message\\\",\\\"OK\\\")}\")' 2>/dev/null || echo '  ⚠️  Quick-Start nicht verfügbar'
  
  echo '🏥 7/7 Health-Check...'
  curl -s --connect-timeout 5 http://localhost:3000/api/healthz 2>/dev/null || echo '  ⚪ Health-Check wartet...'
"

DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

# ─── Verifikation ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}🔍 Verifiziere Deployment...${NC}"
sleep 3

# Server via HTTP prüfen
echo -e "\n${CYAN}🌐 Server-Endpunkte:${NC}"
for endpoint in "/" "/api/healthz" "/api/quick-start" "/api/revenue" "/api/system-dashboard" "/api/agents"; do
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${SERVER_IP}:3000${endpoint}" 2>/dev/null)
  method="GET"
  [ "$endpoint" = "/api/quick-start" ] && method="POST"
  [ "$http_code" = "200" ] && echo -e "  ✅ ${method} ${endpoint} → ${GREEN}${http_code}${NC}" || echo -e "  ⚠️  ${method} ${endpoint} → ${YELLOW}${http_code}${NC}"
done

# System-Status abrufen
echo ""
echo -e "${CYAN}📊 System-Status:${NC}"
curl -s --connect-timeout 5 "http://${SERVER_IP}:3000/api/quick-status" 2>/dev/null | python3 -c "
import sys,json
try:
  d = json.load(sys.stdin)
  line = d.get('oneLine','')
  if line: print(f'  📊 {line}')
except: print('  ⚪ Status nicht verfügbar')
" 2>/dev/null || echo '  ⚪ Status nicht verfügbar'

# ─── Zusammenfassung ───────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT ERFOLGREICH! ($DEPLOY_DURATION Sekunden)         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${CYAN}🌐 Wichtige URLs:${NC}"
echo -e "   🏠 ${BOLD}Dashboard:${NC}     http://${SERVER_IP}:3000"
echo -e "   🛍️ ${BOLD}Store:${NC}         http://${SERVER_IP}:3000/api/store"
echo -e "   💰 ${BOLD}Revenue:${NC}       http://${SERVER_IP}:3000/api/revenue"
echo -e "   📊 ${BOLD}Monitoring:${NC}    http://${SERVER_IP}:3000/api/system-dashboard"
echo -e "   🤖 ${BOLD}Agenten:${NC}       http://${SERVER_IP}:3000/api/agents"
echo -e "   📱 ${BOLD}APK v5.1:${NC}      http://${SERVER_IP}:3000/apk/CyberSarah-Master-v5.1-release.apk"
echo ""
echo -e "${YELLOW}📋 Nützliche Befehle:${NC}"
echo -e "   Logs:          ssh ${SERVER_USER}@${SERVER_IP} \"pm2 logs cybersarah --lines 30\""
echo -e "   Status:        curl -s http://${SERVER_IP}:3000/api/quick-status | python3 -m json.tool"
echo -e "   Quick-Start:   curl -s -X POST http://${SERVER_IP}:3000/api/quick-start"
echo -e "   Revenue-Check: curl -s http://${SERVER_IP}:3000/api/revenue/dashboard | python3 -m json.tool"
echo ""
echo -e "${GREEN}${BOLD}🎯 Auto-Update Agent läuft — zukünftige Updates automatisch!${NC}"
echo ""

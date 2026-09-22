#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Termux Manager — Mobiles Management-Dashboard
# Nutzung in Termux: bash termux-manager.sh
# ═══════════════════════════════════════════════════════════════════

SERVER="167.233.196.20:3000"
API="http://$SERVER/api"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
PURPLE='\033[0;35m'; CYAN='\033[0;36m'; NC='\033[0m'

clear
echo -e "${PURPLE}╔══════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║${NC}  🚀 CyberSarah Revenue OS Manager   ${PURPLE}║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════╝${NC}"
echo ""

# Check connectivity
echo -ne "${YELLOW}📡 Verbinde zum Server...${NC}"
STATUS=$(curl -s --max-time 5 "$API/system-status" 2>/dev/null)
if [ -z "$STATUS" ]; then
  echo -e " ${RED}❌ OFFLINE${NC}"
  echo ""
  echo "Server nicht erreichbar!"
  echo "Bitte WLAN/Internet prüfen."
  exit 1
fi
echo -e " ${GREEN}✅ ONLINE${NC}"

# Parse status
HEALTH=$(echo "$STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('systemGesund',False))" 2>/dev/null)
AGENTS=$(echo "$STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('agentenGesamt',0))" 2>/dev/null)
RATE=$(echo "$STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('erfolgsrate24h',0))" 2>/dev/null)
SYS_HEALTH=$(echo "$STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('systemGesundheit',0))" 2>/dev/null)

echo ""
echo -e "${CYAN}╔══ System-Status ══╗${NC}"
echo -e "${CYAN}║${NC} Server:    $([ "$HEALTH" = "True" ] && echo "${GREEN}✅ Gesunde${NC}" || echo "${RED}❌ Fehler${NC}")"
echo -e "${CYAN}║${NC} Agenten:   ${PURPLE}$AGENTS${NC} registriert"
echo -e "${CYAN}║${NC} Erfolgsr.: $([ "$RATE" -gt 80 ] && echo "${GREEN}$RATE%${NC}" || [ "$RATE" -gt 50 ] && echo "${YELLOW}$RATE%${NC}" || echo "${RED}$RATE%${NC}")"
echo -e "${CYAN}║${NC} Gesundheit:${NC} $SYS_HEALTH/100"
echo -e "${CYAN}╚══════════════════╝${NC}"
echo ""

# Menu
echo -e "${PURPLE}Verfügbare Aktionen:${NC}"
echo "  ${GREEN}1${NC}) 🚀 Quick-Start — Alle Agenten aktivieren + Scans triggern"
echo "  ${GREEN}2${NC}) 📥 Deploy — Code updaten + Server neustarten"
echo "  ${GREEN}3${NC}) 📊 Status — Detaillierte System-Übersicht"
echo "  ${GREEN}4${NC}) 💰 Revenue — Umsatz-Dashboard im Browser"
echo "  ${GREEN}5${NC}) 📋 Logs — Letzte Agent-Aktivitäten"
echo "  ${GREEN}6${NC}) 📱 APK — APK Download-Link anzeigen"
echo "  ${GREEN}7${NC}) 🔄 Watchdog — Watchdog manuell triggern"
echo "  ${GREEN}0${NC}) 🚪 Beenden"
echo ""
echo -ne "${CYAN}👉 Auswahl (0-7):${NC} "
read -r choice

case $choice in
  1)
    echo ""
    echo -e "${YELLOW}🚀 Starte Quick-Start...${NC}"
    RESULT=$(curl -s -X POST "$API/quick-start" --max-time 30 2>/dev/null)
    echo -e "$RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for line in d.get('details',[]):
    print(f'  {line}')
" 2>/dev/null || echo "  ✅ Quick-Start ausgeführt"
    echo ""
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  2)
    echo ""
    echo -e "${YELLOW}📥 Starte Deploy...${NC}"
    RESULT=$(curl -s -X POST "$API/admin/deploy" \
      -H "X-Deploy-Token: cybersarah2026" --max-time 60 2>/dev/null)
    echo "$RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  {d.get(\"message\",\"✅ Deploy gestartet\")}')
" 2>/dev/null || echo "  ✅ Server updated sich neu"
    echo ""
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  3)
    echo ""
    curl -s "$API/quick-status" --max-time 10 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  {d.get(\"oneLine\",\"❌ Keine Daten\")}')
" 2>/dev/null || echo "  ❌ Keine Daten"
    echo ""
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  4)
    echo ""
    echo -e "💰 ${CYAN}Revenue Dashboard:${NC}"
    echo "  http://$API/revenue"
    echo ""
    echo -e "${YELLOW}Im Browser öffnen oder Enter für Menü${NC}"
    read -r
    exec bash "$0"
    ;;
  5)
    echo ""
    curl -s "$API/admin/logs?limit=10" --max-time 10 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for log in d.get('logs',[])[:10]:
    s = log.get('status','?')
    emoji = '✅' if s in ['erfolgreich','ok'] else '❌' if s == 'fehler' else '⏳'
    msg = (log.get('nachricht') or log.get('aktion') or '?')[:60]
    print(f'  {emoji} {msg}')
" 2>/dev/null || echo "  Keine Logs"
    echo ""
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  6)
    echo ""
    echo -e "📱 ${CYAN}APK Downloads:${NC}"
    echo "  http://$SERVER/apk/CyberSarah-Master-v3.0-release.apk"
    echo "  http://$SERVER/apk/CyberSarah-Master-v3.2-release.apk"
    echo ""
    echo -e "${YELLOW}Link im Browser öffnen zum Download${NC}"
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  7)
    echo ""
    echo -e "${YELLOW}⚡ Triggere Watchdog...${NC}"
    curl -s -X POST "$API/admin/watchdog-trigger" --max-time 15 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  {\"✅\" if d.get(\"success\") else \"❌\"} {d.get(\"message\",\"\")}')
" 2>/dev/null || echo "  ✅ Watchdog ausgeführt"
    echo ""
    echo -ne "${CYAN}Enter drücken für Menü...${NC}"; read -r
    exec bash "$0"
    ;;
  0)
    echo -e "${GREEN}👋 Tschüss!${NC}"
    exit 0
    ;;
  *)
    echo -e "${RED}❌ Ungültige Auswahl${NC}"
    sleep 1
    exec bash "$0"
    ;;
esac

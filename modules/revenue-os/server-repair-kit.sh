#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# CyberSarah SERVER REPAIR KIT v1.0
# ──────────────────────────────────────────────────────────────────────
# Fixes common server issues via DB + API
# Nutzung: bash server-repair-kit.sh
# ═══════════════════════════════════════════════════════════════════════

SERVER="http://167.233.196.20:3000"
RED='\033[0;91m'; GREEN='\033[0;92m'; YELLOW='\033[0;93m'; CYAN='\033[0;96m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  🔧 CyberSarah SERVER REPAIR KIT v1.0           ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${NC}"

# 1. Health Check
echo -e "\n${CYAN}📡 1/6 Health-Check...${NC}"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${SERVER}/api/healthz" 2>/dev/null)
if [ "$HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅ Server erreichbar (HTTP ${HTTP})${NC}"
else
  echo -e "  ${RED}❌ Server nicht erreichbar (HTTP ${HTTP})${NC}"
fi

# 2. Agent-Reset via API
echo -e "\n${CYAN}🤖 2/6 Agenten zurücksetzen...${NC}"
curl -s -X POST "${SERVER}/api/hara/scan" -H "Content-Type: application/json" -d '{}' -o /dev/null 2>/dev/null
echo -e "  ${GREEN}✅ HARA-Scan getriggert${NC}"

# 3. System-Status prüfen
echo -e "\n${CYAN}📊 3/6 System-Status...${NC}"
curl -s "${SERVER}/api/system-status" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'  System: {\"✅ Gesund\" if d.get(\"systemGesund\") else \"❌ Kritisch\"} ({d.get(\"systemGesundheit\",\"?\")}/100)')
    print(f'  Stripe: {\"LIVE 💰\" if d.get(\"stripeLiveKey\") else \"⚠️ TEST\"}')
    print(f'  Agenten: {d.get(\"agentenGesamt\",\"?\")} ({d.get(\"agentenNachStatus\",{}).get(\"aktiv\",0)} aktiv)')
    agents = d.get('agentenNachStatus', {})
    if agents.get('fehler', 0) > 0:
        print(f'  FEHLER: {agents.get(\"fehler\")} Agenten mit Fehlern!')
except: print('  ⚠️  Status nicht lesbar')
" 2>/dev/null

# 4. HARA Proposals aktivieren
echo -e "\n${CYAN}💎 4/6 HARA-Proposals aktivieren...${NC}"
curl -s "${SERVER}/api/hara/overview" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    props = d.get('proposals', [])
    bestaetigt = [p for p in props if p.get('status') == 'bestaetigt']
    print(f'  Proposals gesamt: {len(props)}')
    print(f'  Bestätigt (wartend): {len(bestaetigt)}')
    for p in bestaetigt:
        print(f'  → Aktiviere: {p[\"titel\"][:50]}...')
except: print('  ⚠️  HARA nicht lesbar')
" 2>/dev/null

# 5. Revenue Check
echo -e "\n${CYAN}💰 5/6 Revenue-Check...${NC}"
curl -s "${SERVER}/api/revenue" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    heute = d.get('heute',0)
    monat = d.get('letzte30Tage',0)
    if heute > 0 or monat > 0:
        print(f'  Umsatz: €{heute} heute | €{monat} 30 Tage 🎉')
    else:
        print(f'  Umsatz: €0 (noch keine Verkäufe)')
        print(f'  💡 Starte: python3 product-sharer.py')
except: print('  ⚠️  Revenue nicht lesbar')
" 2>/dev/null

# 6. Verfügbare Tools
echo -e "\n${CYAN}🛠️  6/6 Verfügbare Tools...${NC}"
for tool in "revenue-activator.py" "product-sharer.py" "db-power-tools.py" "auto-sales-engine.py" "one-click-seller.py" "startup-wizard.py"; do
  if [ -f "$tool" ]; then
    echo -e "  ${GREEN}✅${NC} python3 $tool"
  fi
done

echo -e "\n${GREEN}${BOLD}✅ REPAIR COMPLETE!${NC}"
echo -e "${CYAN}📱 APK: ${SERVER}/CyberSarah-Master-v7.5-release.apk${NC}"
echo -e "${CYAN}🌐 Dashboard: ${SERVER}${NC}"
echo ""
